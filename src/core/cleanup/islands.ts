import { type LabelMap, NO_LABEL } from '../types'
import { bridgeDiagonals } from './diagonals'
import { type RegionInfo, connectedRegions } from './regions'

/** Marks a region with no coloured neighbour at all: it is removed (becomes NO_LABEL). */
const OUTSIDE = -2

/**
 * Removes every patch smaller than minAreaMm2: it takes the colour of the neighbour it shares
 * the longest border with. Repeats until no patch is too small. Returns a new map.
 *
 * - A patch only merges into a LARGER neighbour (ties by id). Two tiny neighbours can then
 *   never swap colours back and forth, and the smallest patch always has somewhere to go,
 *   so the loop always ends. Chains (a speck in a small ring in a big area) resolve at once.
 * - The outside (NO_LABEL) is never a neighbour to merge into. A speck with nothing but
 *   outside around it can't be tufted and is removed.
 * - Tiny see-through holes inside the art (transparent pixels enclosed by colour, smaller
 *   than the threshold) are filled with the colour around them: too small to cut or tuft.
 *   Holes that are big enough, and transparency touching the edge, stay outside.
 * - First, corner-only contacts are closed (bridgeDiagonals). A thin diagonal or curved line
 *   is a staircase of pixels touching at corners; bridged, it is one long patch instead of
 *   hundreds of specks, so it is kept. Thin lines are never deleted here; 4.3 flags them.
 */
export function mergeSmallIslands(map: LabelMap, minAreaMm2: number): LabelMap {
  const { width: w, height: h } = map
  const labels = bridgeDiagonals(map).labels
  fillSmallHoles(labels, map.width, map.height, minAreaMm2 / (map.mmPerPx * map.mmPerPx))
  const mm2PerPx = map.mmPerPx * map.mmPerPx

  while (true) {
    const { ids, regions } = connectedRegions({ ...map, labels })
    const small = regions.filter((r) => r.areaPx * mm2PerPx < minAreaMm2)
    if (small.length === 0) break

    // Larger in a strict, total order: by area, then by lower id.
    const larger = (a: RegionInfo, b: RegionInfo) =>
      a.areaPx > b.areaPx || (a.areaPx === b.areaPx && a.id < b.id)

    // Where each small region goes: a larger region's id, OUTSIDE, or nowhere this round.
    const target = new Map<number, number>()
    for (const r of small) {
      const border = borderLengths(r, ids, w, h)
      if (border.size === 0) {
        target.set(r.id, OUTSIDE)
        continue
      }
      let best = -1
      for (const [n, length] of border) {
        if (!larger(regions[n], r)) continue
        const bestLength = best === -1 ? -1 : border.get(best)!
        if (length > bestLength || (length === bestLength && larger(regions[n], regions[best]))) {
          best = n
        }
      }
      // No larger neighbour: smaller ones merge into this one instead, so it grows.
      if (best !== -1) target.set(r.id, best)
    }

    // Follow chains to the end: if the target merges too, go where it goes.
    const finalLabel = (id: number): number => {
      let t = id
      while (target.has(t)) {
        t = target.get(t)!
        if (t === OUTSIDE) return NO_LABEL
      }
      return regions[t].label
    }

    for (const r of small) {
      if (!target.has(r.id)) continue
      const label = finalLabel(r.id)
      const [x0, y0, x1, y1] = r.bbox
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (ids[y * w + x] === r.id) labels[y * w + x] = label
        }
      }
    }
  }
  return { ...map, labels }
}

/** For one region: how many pixel sides it shares with each neighbouring region. */
function borderLengths(r: RegionInfo, ids: Int32Array, w: number, h: number): Map<number, number> {
  const border = new Map<number, number>()
  const count = (q: number) => {
    const n = ids[q]
    if (n !== r.id && n !== -1) border.set(n, (border.get(n) ?? 0) + 1)
  }
  const [x0, y0, x1, y1] = r.bbox
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const p = y * w + x
      if (ids[p] !== r.id) continue
      if (x > 0) count(p - 1)
      if (x < w - 1) count(p + 1)
      if (y > 0) count(p - w)
      if (y < h - 1) count(p + w)
    }
  }
  return border
}

/**
 * Fills each patch of NO_LABEL (4-connected) that doesn't touch the map's edge and is smaller
 * than minAreaPx with the colour most common along its border. Changes `labels` in place.
 */
function fillSmallHoles(labels: Uint8Array, w: number, h: number, minAreaPx: number): void {
  const seen = new Uint8Array(w * h)
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || labels[start] !== NO_LABEL) continue
    const patch: number[] = []
    const border = new Map<number, number>()
    let touchesEdge = false
    const stack = [start]
    seen[start] = 1
    while (stack.length > 0) {
      const p = stack.pop()!
      patch.push(p)
      const x = p % w
      const y = (p - x) / w
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true
      for (const q of [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ]) {
        if (q === -1) continue
        if (labels[q] !== NO_LABEL) border.set(labels[q], (border.get(labels[q]) ?? 0) + 1)
        else if (!seen[q]) {
          seen[q] = 1
          stack.push(q)
        }
      }
    }
    if (touchesEdge || patch.length >= minAreaPx || border.size === 0) continue
    const fill = [...border].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
    for (const p of patch) labels[p] = fill
  }
}
