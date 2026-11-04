import { deltaE } from '../core/color/distance'
import type { PaletteEntry } from '../core/types'

/** Closer than this (deltaE) to another colour: described relative to it... */
const RELATED_DELTA_E = 25
/** ...but only if hue and saturation are this close too (the a/b plane of OKLab): white is
 *  no "lighter shade" of a pale yellow, it has no colour at all. */
const RELATED_HUE = 0.08
/** A lightness difference of at least this makes it a lighter or darker shade. */
const SHADE_L = 0.05

/**
 * A short description of a newly added colour for the user, e.g.
 * "Colour 6: a darker shade of Colour 2 (Yellow)", "…: a variation of …" or "…: a new colour".
 */
export function describeAddedColour(added: PaletteEntry, others: PaletteEntry[]): string {
  const label = `Colour ${added.number}`
  let nearest: PaletteEntry | null = null
  let best = RELATED_DELTA_E
  for (const o of others) {
    const d = deltaE(o.lab, added.lab)
    const hue = Math.hypot(o.lab.a - added.lab.a, o.lab.b - added.lab.b)
    if (o.number !== added.number && d < best && hue < RELATED_HUE) {
      best = d
      nearest = o
    }
  }
  if (!nearest) return `${label}: a new colour`
  const of = `Colour ${nearest.number} (${nearest.name})`
  const dL = added.lab.L - nearest.lab.L
  if (dL <= -SHADE_L) return `${label}: a darker shade of ${of}`
  if (dL >= SHADE_L) return `${label}: a lighter shade of ${of}`
  return `${label}: a variation of ${of}`
}
