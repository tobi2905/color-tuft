import { MIN_PEAK_SHARE, type Peak } from './peaks'

export const MIN_SUGGESTED = 2
export const MAX_SUGGESTED = 16

/**
 * "This art has N colours": the number of distinct peaks with at least MIN_PEAK_SHARE, kept
 * within 2..16. These are exactly the colours findPalette picks first, so the suggested
 * count gives back the art's real colours. A gradient counts once; splitting it into
 * bands is the user's choice.
 */
export function suggestCount(peaks: Peak[]): number {
  const colours = peaks.filter((p) => p.distinct && p.share >= MIN_PEAK_SHARE).length
  return Math.min(MAX_SUGGESTED, Math.max(MIN_SUGGESTED, colours))
}
