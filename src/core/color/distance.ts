import type { OKLab } from '../types'

export type MatchRating = 'very-close' | 'close' | 'noticeable'

/** Below this deltaE two colours are hard to tell apart, even side by side. Tuned later. */
export const VERY_CLOSE = 3
/** Below this deltaE a colour still works as a substitute. Tuned later. */
export const CLOSE = 8

/** How different two colours look: straight-line distance in OKLab, times 100 for readable numbers. */
export function deltaE(a: OKLab, b: OKLab): number {
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b) * 100
}

/** A distance in words. The thresholds mean "under": exactly VERY_CLOSE is already 'close'. */
export function matchRating(d: number): MatchRating {
  if (d < VERY_CLOSE) return 'very-close'
  if (d < CLOSE) return 'close'
  return 'noticeable'
}
