import { deltaE } from '../core/color/distance'
import type { OKLab, PaletteEntry } from '../core/types'

/**
 * What the yarn select shows: 'auto' (no colour chosen), a palette number as text, or 'other'.
 * `otherChosen`: the user picked "Other colour…". Then it stays 'other' even while the colour
 * still matches a palette entry (it starts from the previous colour), so the colour picker
 * stays open instead of jumping back to that entry.
 */
export function yarnChoice(
  value: OKLab | null,
  palette: PaletteEntry[],
  otherChosen: boolean,
): string {
  if (value === null) return 'auto'
  if (otherChosen) return 'other'
  const match = palette.find((p) => deltaE(p.lab, value) < 3)
  return match ? String(match.number) : 'other'
}
