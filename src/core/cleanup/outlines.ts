import { type LabelMap, NO_LABEL, type OKLab } from '../types'
import { distanceTransform } from './distance'

/** Which borders get a line: every colour border plus the outer edge, the outer edge only,
 *  or only the borders between chosen pairs of colours. */
export type OutlineWhere = 'all' | 'outer' | { pairs: [number, number][] }

/** A colour this dark (OKLab L) or darker can be an existing outline. */
const OUTLINE_MAX_L = 0.35
/** Existing outlines are on average at most this wide (mm). */
const OUTLINE_MAX_MEAN_WIDTH_MM = 15
/** ...and cover at least this share of the rug, so a few dark specks don't count. */
const OUTLINE_MIN_SHARE = 0.01

/**
 * Separation outlines: every pixel close enough to a chosen border takes `label` (the
 * outline yarn). Off unless the user turns it on; widthMm 0 changes nothing.
 *
 * - Between two colours the line is centred on the border: widthMm / 2 on each side.
 * - Along the outer edge of the rug (next to NO_LABEL, or the edge of the map for a
 *   rectangular rug) the line lies fully inside, widthMm wide: the rug's shape never changes.
 * - 'all' = every border between colours plus the outer edge.
 *
 * Distances are measured from the crack between two pixels: a pixel next to the border has
 * its centre half a pixel from it. Returns a new map.
 */
export function addOutlines(
  map: LabelMap,
  opts: { widthMm: number; label: number; where: OutlineWhere },
): LabelMap {
  const { width: w, height: h, labels } = map
  const out = Uint8Array.from(labels)
  if (!(opts.widthMm > 0)) return { ...map, labels: out }

  const pairSet =
    typeof opts.where === 'object'
      ? new Set(opts.where.pairs.flatMap(([a, b]) => [`${a},${b}`, `${b},${a}`]))
      : null
  const innerChosen = (a: number, b: number) =>
    opts.where === 'all' || (pairSet !== null && pairSet.has(`${a},${b}`))
  const outer = opts.where === 'all' || opts.where === 'outer'

  // Seeds: the pixels on either side of a chosen border (0 = seed, for the distance transform).
  const notInner = new Uint8Array(w * h).fill(1)
  const notOuter = new Uint8Array(w * h).fill(1)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const a = labels[p]
      if (a === NO_LABEL) continue
      const neighbours = [
        x + 1 < w ? p + 1 : -1,
        y + 1 < h ? p + w : -1,
        x > 0 ? p - 1 : -1,
        y > 0 ? p - w : -1,
      ]
      for (const q of neighbours) {
        const b = q === -1 ? NO_LABEL : labels[q]
        if (b === NO_LABEL) {
          if (outer) notOuter[p] = 0
        } else if (b !== a && innerChosen(a, b)) {
          notInner[p] = 0
        }
      }
    }
  }

  const px = opts.widthMm / map.mmPerPx // width in pixels
  const toInner = distanceTransform(notInner, w, h)
  const toOuter = distanceTransform(notOuter, w, h)
  for (let p = 0; p < w * h; p++) {
    if (labels[p] === NO_LABEL) continue
    // Seed centres are half a pixel from the border, hence the − 0.5.
    if (toInner[p] <= px / 2 - 0.5 || toOuter[p] <= px - 0.5) out[p] = opts.label
  }
  return { ...map, labels: out }
}

/**
 * The label of a colour that already works as outlines in the art, or null. Such a colour
 * is dark, covers at least 1 % of the rug, and is on average thin: twice its area divided by
 * its border length (the mean width of a line) is at most 15 mm. When there are several,
 * the darkest wins. Only a suggestion: the app never turns outlines on by itself.
 */
export function suggestOutlines(map: LabelMap, palette: OKLab[]): number | null {
  const { width: w, height: h, labels } = map
  const area = new Map<number, number>()
  const border = new Map<number, number>()
  const add = (m: Map<number, number>, l: number, v: number) => m.set(l, (m.get(l) ?? 0) + v)

  let coloured = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const a = labels[p]
      if (a === NO_LABEL) continue
      coloured++
      add(area, a, 1)
      // Count each pixel side that faces a different label (or the edge) as border.
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const b = nx < 0 || ny < 0 || nx >= w || ny >= h ? NO_LABEL : labels[ny * w + nx]
        if (b !== a) add(border, a, 1)
      }
    }
  }

  let best: number | null = null
  for (const [label, px] of area) {
    const lab = palette[label]
    if (!lab || lab.L > OUTLINE_MAX_L || px < OUTLINE_MIN_SHARE * coloured) continue
    const meanWidthMm = ((2 * px) / (border.get(label) ?? 1)) * map.mmPerPx
    if (meanWidthMm > OUTLINE_MAX_MEAN_WIDTH_MM) continue
    if (best === null || lab.L < palette[best].L) best = label
  }
  return best
}
