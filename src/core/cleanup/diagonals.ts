import type { LabelMap } from '../types'
import { connectedRegions } from './regions'

const MAX_PASSES = 10

/**
 * Closes corner-only contacts. Where a 2 × 2 block is a checker (a b / b a), each colour's
 * two pixels touch only at a corner. One of the other two pixels takes the colour whose
 * patch (counting corner contact) is smaller, so that colour now connects through a side.
 * The smaller patch is the one that would fall apart: typically a thin diagonal or curved
 * line, a staircase of pixels touching at corners. The bigger one is connected around it.
 *
 * Afterwards side contact and corner contact give the same patches, so cleanup and tracing
 * (which use side contact) see a thin line as one line, not as many specks. Lines grow by at
 * most one pixel per step. The outside never wins, and a coloured pixel never becomes outside.
 */
export function bridgeDiagonals(map: LabelMap): LabelMap {
  const { width: w, height: h } = map
  const labels = Uint8Array.from(map.labels)

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { ids, regions } = connectedRegions({ ...map, labels }, 8)
    const area = (p: number) => (ids[p] === -1 ? Infinity : regions[ids[p]].areaPx)
    let changed = false

    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const tl = y * w + x
        const tr = tl + 1
        const bl = tl + w
        const br = bl + 1
        const a = labels[tl] // on the diagonal tl–br
        const b = labels[tr] // on the diagonal tr–bl
        if (a === b || labels[br] !== a || labels[bl] !== b) continue

        // Connect the smaller patch; the outside (area Infinity) never wins.
        const connectA = area(tl) < area(tr) || (area(tl) === area(tr) && a < b)
        if (connectA)
          labels[tr] = a // tl–tr–br now joined through sides
        else labels[tl] = b // tr–tl–bl now joined through sides
        changed = true
      }
    }
    if (!changed) break
  }
  return { ...map, labels }
}
