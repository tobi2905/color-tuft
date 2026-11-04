import { type LabelMap, NO_LABEL, type Pt } from '../types'
import { distanceTransform } from './distance'
import { connectedRegions } from './regions'

/** A part of one colour that is thinner than tuftable: where it is (mm) and about how wide. */
export type ThinPart = { label: number; at: Pt; widthMm: number }

/**
 * A thin patch only counts as a line if its area is at least this many times minWidth².
 * The very tip of any sharp corner is "too thin" too, but it is only a sliver.
 */
const MIN_LINE_AREA_FACTOR = 2
/** Thickening repeats at most this often (one round is almost always enough). */
const MAX_THICKEN_ROUNDS = 3

/**
 * Parts of each colour thinner than minWidthMm. "At least W wide everywhere" means a coin of
 * diameter W, moved around inside the colour, reaches every pixel of it:
 * 1. distance transform: how far each pixel is from the nearest pixel of another colour;
 * 2. where that is at least W/2, the coin's centre fits;
 * 3. every pixel within W/2 of such a centre is covered;
 * 4. pixels nothing covers are too thin. Groups of them big enough to be a line (not just a
 *    corner tip) are reported, one warning per group.
 * Never deletes anything: it only reports.
 */
export function findThinParts(map: LabelMap, minWidthMm: number): ThinPart[] {
  const parts: ThinPart[] = []
  const boxes = colourBoxes(map)
  for (const label of [...boxes.keys()].sort((a, b) => a - b)) {
    const crop = analyse(map, label, boxes.get(label)!, minWidthMm)
    for (const group of crop.groups) {
      let maxInside = 0
      for (const i of group) maxInside = Math.max(maxInside, crop.inside[i])
      parts.push({
        label,
        at: representativePoint(map, crop, group),
        // A line n pixels wide has its middle about (n + 1) / 2 from the outside.
        widthMm: Math.max(1, 2 * maxInside - 1) * map.mmPerPx,
      })
    }
  }
  return parts
}

/**
 * Makes every thin line of `label` at least minWidthMm wide: pixels within minWidth / 2 of
 * a thin part take the label. Corner tips are left alone, and the outside of the rug
 * (NO_LABEL) never changes, so the rug's shape stays the same. Returns a new map.
 */
export function thickenLabel(map: LabelMap, label: number, minWidthMm: number): LabelMap {
  const labels = Uint8Array.from(map.labels)
  const grow = minWidthMm / (2 * map.mmPerPx) // in pixels

  for (let round = 0; round < MAX_THICKEN_ROUNDS; round++) {
    const current = { ...map, labels }
    const box = colourBoxes(current).get(label)
    if (!box) break
    const crop = analyse(current, label, box, minWidthMm)
    if (crop.groups.length === 0) break

    // Distance from every crop pixel to the nearest pixel of a reported thin part. The crop's
    // margin is wider than `grow`, so every pixel that changes lies inside it.
    const notThin = new Uint8Array(crop.w * crop.h).fill(1)
    for (const group of crop.groups) for (const i of group) notThin[i] = 0
    const toThin = distanceTransform(notThin, crop.w, crop.h)
    for (let i = 0; i < crop.w * crop.h; i++) {
      const p = crop.toMap(i)
      if (toThin[i] <= grow && labels[p] !== NO_LABEL) labels[p] = label
    }
  }
  return { ...map, labels }
}

type Box = { x0: number; y0: number; x1: number; y1: number }

/** Bounding box of every colour in the map (not NO_LABEL), in one pass. */
function colourBoxes(map: LabelMap): Map<number, Box> {
  const boxes = new Map<number, Box>()
  const w = map.width
  for (let p = 0; p < map.labels.length; p++) {
    const l = map.labels[p]
    if (l === NO_LABEL) continue
    const x = p % w
    const y = (p - x) / w
    const b = boxes.get(l)
    if (!b) boxes.set(l, { x0: x, y0: y, x1: x, y1: y })
    else {
      if (x < b.x0) b.x0 = x
      if (x > b.x1) b.x1 = x
      if (y < b.y0) b.y0 = y
      if (y > b.y1) b.y1 = y
    }
  }
  return boxes
}

/**
 * Steps 1 to 4 for one colour, worked out on its bounding box plus a margin. The margin is
 * all other colours, so nothing outside it can be nearer: same result, far less work.
 */
type Crop = {
  x0: number
  y0: number
  w: number
  h: number
  /** Crop index -> map index. */
  toMap: (i: number) => number
  /** Distance of each crop pixel to the nearest other colour. */
  inside: Float32Array
  /** Groups of thin pixels big enough to be a line, as crop indices. */
  groups: number[][]
}

function analyse(map: LabelMap, label: number, box: Box, minWidthMm: number): Crop {
  const radius = minWidthMm / (2 * map.mmPerPx) // coin radius in pixels
  const margin = Math.ceil(radius) + 2
  const x0 = Math.max(0, box.x0 - margin)
  const y0 = Math.max(0, box.y0 - margin)
  const w = Math.min(map.width - 1, box.x1 + margin) - x0 + 1
  const h = Math.min(map.height - 1, box.y1 + margin) - y0 + 1
  const toMap = (i: number) => (y0 + Math.floor(i / w)) * map.width + x0 + (i % w)

  const isLabel = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) isLabel[i] = map.labels[toMap(i)] === label ? 1 : 0
  const inside = distanceTransform(isLabel, w, h)

  // 0 where the coin's centre fits, so the next transform measures distance to a centre.
  // "At least radius" (not "more than"): a band of an even number of pixels has no pixel
  // centre exactly in its middle, so its best centre is exactly radius from one side.
  const notCentre = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) notCentre[i] = inside[i] >= radius ? 0 : 1
  const toCentre = distanceTransform(notCentre, w, h)

  // Thin pixels as a small label map (0 = thin), grouped with corner contact counting.
  const thin = new Uint8Array(w * h).fill(NO_LABEL)
  for (let i = 0; i < w * h; i++) if (isLabel[i] && !(toCentre[i] <= radius)) thin[i] = 0
  const { ids, regions } = connectedRegions(
    { width: w, height: h, mmPerPx: map.mmPerPx, labels: thin },
    8,
  )

  const minAreaPx = (MIN_LINE_AREA_FACTOR * minWidthMm * minWidthMm) / map.mmPerPx ** 2
  const byRegion: (number[] | null)[] = regions.map((r) => (r.areaPx >= minAreaPx ? [] : null))
  for (let i = 0; i < w * h; i++) if (ids[i] !== -1) byRegion[ids[i]]?.push(i)
  const groups = byRegion.filter((g): g is number[] => g !== null)

  return { x0, y0, w, h, toMap, inside, groups }
}

/** A point on the group (mm): the group's pixel closest to the group's average position. */
function representativePoint(map: LabelMap, crop: Crop, group: number[]): Pt {
  let sx = 0
  let sy = 0
  for (const i of group) {
    sx += i % crop.w
    sy += Math.floor(i / crop.w)
  }
  const cx = sx / group.length
  const cy = sy / group.length
  let best = group[0]
  let bestD = Infinity
  for (const i of group) {
    const d = ((i % crop.w) - cx) ** 2 + (Math.floor(i / crop.w) - cy) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return {
    x: (crop.x0 + (best % crop.w) + 0.5) * map.mmPerPx,
    y: (crop.y0 + Math.floor(best / crop.w) + 0.5) * map.mmPerPx,
  }
}
