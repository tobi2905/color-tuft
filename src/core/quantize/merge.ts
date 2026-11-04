import { deltaE } from '../color/distance'
import { type LabelMap, NO_LABEL, type OKLab } from '../types'

/** "Make every `from` pixel `into`". Stored by colour: labels can change between runs. */
export type ColourMerge = { from: OKLab; into: OKLab }

/** A merge's colours are found again if a palette colour is this close (deltaE). */
export const MERGE_MATCH_DELTA_E = 10

/**
 * Joins colours the user chose to merge: every pixel of `from` becomes `into`, and `from`
 * leaves the palette. Each merge looks up its two colours in the palette (nearest within
 * MERGE_MATCH_DELTA_E); if either is gone, it is skipped. Chains resolve (A into B into C
 * ends as C); a merge that would form a loop is skipped. The palette keeps its order.
 */
export function applyMerges(
  map: LabelMap,
  palette: OKLab[],
  merges: ColourMerge[],
): { map: LabelMap; palette: OKLab[] } {
  const into = new Map<number, number>() // label -> label it merges into
  const root = (label: number): number => {
    let r = label
    while (into.has(r)) r = into.get(r)!
    return r
  }

  for (const m of merges) {
    const from = nearest(palette, m.from)
    if (from === -1) continue
    const to = nearest(palette, m.into, from)
    if (to === -1 || into.has(from) || root(to) === from) continue // gone, already merged, or a loop
    into.set(from, to)
  }
  if (into.size === 0) return { map, palette }

  // New label numbers for the colours that stay, in their old order.
  const newLabel = new Array<number>(palette.length).fill(-1)
  const kept: OKLab[] = []
  palette.forEach((colour, label) => {
    if (!into.has(label)) {
      newLabel[label] = kept.length
      kept.push(colour)
    }
  })

  // New label per old label once, then a plain loop (a callback per pixel is far slower).
  const relabel = palette.map((_, l) => newLabel[root(l)])
  const labels = new Uint8Array(map.labels.length)
  for (let p = 0; p < labels.length; p++) {
    const l = map.labels[p]
    labels[p] = l === NO_LABEL ? NO_LABEL : relabel[l]
  }
  return { map: { ...map, labels }, palette: kept }
}

/** The palette colour nearest to `c` within MERGE_MATCH_DELTA_E (other than `except`), or -1. */
function nearest(palette: OKLab[], c: OKLab, except = -1): number {
  let best = -1
  let bestD = MERGE_MATCH_DELTA_E
  palette.forEach((p, i) => {
    const d = deltaE(p, c)
    if (i !== except && d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}
