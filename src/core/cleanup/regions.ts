import { type LabelMap, NO_LABEL } from '../types'

export type RegionInfo = {
  id: number
  label: number
  areaPx: number
  /** [minX, minY, maxX, maxY], inclusive, in pixels. */
  bbox: [number, number, number, number]
}

/**
 * Patches of touching same-label pixels. By default pixels touch only through a shared side
 * (4-connected), so shapes meeting at a corner stay separate. With connectivity 8, corner
 * contact counts too: a thin diagonal or curved line, a staircase of pixels touching only
 * at corners, is then one patch instead of many tiny ones.
 *
 * `ids` gives each pixel its region id (-1 for NO_LABEL); `regions[id]` describes it.
 * Ids follow the order regions are first met, scanning row by row.
 *
 * Flood fill with an explicit to-do stack instead of recursion: one background region
 * can have millions of pixels, far deeper than the call stack allows.
 */
export function connectedRegions(
  map: LabelMap,
  connectivity: 4 | 8 = 4,
): { ids: Int32Array; regions: RegionInfo[] } {
  const { width: w, height: h, labels } = map
  const n = w * h
  const ids = new Int32Array(n).fill(-1)
  const regions: RegionInfo[] = []
  // Every pixel is pushed at most once (it gets its id when pushed), so n slots suffice.
  const stack = new Int32Array(n)

  for (let start = 0; start < n; start++) {
    if (ids[start] !== -1 || labels[start] === NO_LABEL) continue

    const id = regions.length
    const label = labels[start]
    let area = 0
    let minX = w
    let minY = h
    let maxX = -1
    let maxY = -1

    let top = 0
    stack[top++] = start
    ids[start] = id
    while (top > 0) {
      const p = stack[--top]
      const x = p % w
      const y = (p - x) / w
      area++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      // Neighbours inside the map with the same label, not yet visited, join the region.
      const visit = (q: number) => {
        if (ids[q] === -1 && labels[q] === label) {
          ids[q] = id
          stack[top++] = q
        }
      }
      if (x > 0) visit(p - 1)
      if (x < w - 1) visit(p + 1)
      if (y > 0) visit(p - w)
      if (y < h - 1) visit(p + w)
      if (connectivity === 8) {
        if (x > 0 && y > 0) visit(p - w - 1)
        if (x < w - 1 && y > 0) visit(p - w + 1)
        if (x > 0 && y < h - 1) visit(p + w - 1)
        if (x < w - 1 && y < h - 1) visit(p + w + 1)
      }
    }
    regions.push({ id, label, areaPx: area, bbox: [minX, minY, maxX, maxY] })
  }
  return { ids, regions }
}
