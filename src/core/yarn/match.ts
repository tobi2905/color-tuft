import { hexToRgb, srgbToOklab } from '../color/convert'
import { CLOSE, type MatchRating, deltaE, matchRating } from '../color/distance'
import type { OKLab, Yarn } from '../types'

/** Two art colours further apart than this (deltaE) should not share a yarn. */
export const COLLISION_DELTA_E = 10

export type YarnMatch = { yarn: Yarn; deltaE: number; rating: MatchRating }
export type YarnSuggestion = { yarnId: string | null; deltaE: number; collision: boolean }

export function yarnLab(yarn: Yarn): OKLab {
  return srgbToOklab(hexToRgb(yarn.hex))
}

/** The `n` yarns closest to a colour, closest first, each rated in words. */
export function findMatches(lab: OKLab, yarns: Yarn[], n = 5): YarnMatch[] {
  return yarns
    .map((yarn) => ({ yarn, deltaE: deltaE(lab, yarnLab(yarn)) }))
    .sort((a, b) => a.deltaE - b.deltaE)
    .slice(0, n)
    .map((m) => ({ ...m, rating: matchRating(m.deltaE) }))
}

/**
 * For each palette colour, the closest stock yarn, or null when none is closer than CLOSE
 * ("no close match"). `deltaE` is the distance to the closest yarn either way (Infinity
 * without stock). `collision` marks colours more than COLLISION_DELTA_E apart that landed on
 * the same yarn: the pattern would lose a difference the art has.
 */
export function suggestYarns(palette: OKLab[], stock: Yarn[]): YarnSuggestion[] {
  const owned = stock.filter((y) => y.list === 'stock')
  const suggestions = palette.map((lab) => {
    const [best] = findMatches(lab, owned, 1)
    if (!best) return { yarnId: null, deltaE: Infinity, collision: false }
    return {
      yarnId: best.deltaE < CLOSE ? best.yarn.id : null,
      deltaE: best.deltaE,
      collision: false,
    }
  })
  for (let i = 0; i < palette.length; i++)
    for (let j = i + 1; j < palette.length; j++) {
      const same = suggestions[i].yarnId !== null && suggestions[i].yarnId === suggestions[j].yarnId
      if (same && deltaE(palette[i], palette[j]) > COLLISION_DELTA_E) {
        suggestions[i].collision = true
        suggestions[j].collision = true
      }
    }
  return suggestions
}

/**
 * "My yarns only": the stock yarns that replace the palette, each colour mapped to its nearest
 * owned yarn however far it is (only owned yarns may be used), each yarn once, in palette order.
 * Their colours become the pipeline's locked colours.
 */
export function yarnsOnlyColours(palette: OKLab[], stock: Yarn[]): { yarn: Yarn; lab: OKLab }[] {
  const owned = stock.filter((y) => y.list === 'stock')
  const chosen = new Map<string, { yarn: Yarn; lab: OKLab }>()
  for (const lab of palette) {
    const [best] = findMatches(lab, owned, 1)
    if (best && !chosen.has(best.yarn.id))
      chosen.set(best.yarn.id, { yarn: best.yarn, lab: yarnLab(best.yarn) })
  }
  return [...chosen.values()]
}
