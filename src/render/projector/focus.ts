import type { VectorPattern } from '../../core/types'

/** The colours (labels) the pattern uses, each once, in palette order. */
export function coloursInPattern(pattern: VectorPattern): number[] {
  return [...new Set(pattern.regions.map((r) => r.label))].sort((a, b) => a - b)
}

/**
 * The next colour to show, one at a time: forward (1) or back (-1), wrapping round. From
 * nothing, or from a colour no longer in the pattern (e.g. merged away), it starts at the
 * first colour (or the last, going back). Null if there are no colours.
 */
export function stepFocus(
  current: number | null,
  colours: number[],
  direction: 1 | -1,
): number | null {
  if (colours.length === 0) return null
  const i = current === null ? -1 : colours.indexOf(current)
  if (i === -1) return direction === 1 ? colours[0] : colours[colours.length - 1]
  return colours[(i + direction + colours.length) % colours.length]
}

/** The regions of one colour: the ones to light up. */
export function focusRegions(pattern: VectorPattern, label: number): number[] {
  return pattern.regions.flatMap((r, i) => (r.label === label ? [i] : []))
}
