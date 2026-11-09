import type { OKLab } from '../types'

/** Below this chroma (colourfulness in OKLab) a colour reads as white, grey or black. */
const NEUTRAL_CHROMA = 0.03

/** Hue ranges in degrees around the OKLab a/b plane, measured from the sample colours in the
 *  test (red sits near 27°, orange 54°, yellow 95°, green 145°, teal 183°, blue 260°,
 *  purple 304°, pink 353°). Pink wraps round 0°. */
const HUES: [maxDeg: number, name: string][] = [
  [15, 'Pink'],
  [45, 'Red'],
  [70, 'Orange'],
  [120, 'Yellow'],
  [170, 'Green'],
  [220, 'Teal'],
  [285, 'Blue'],
  [330, 'Purple'],
  [360, 'Pink'],
]

/**
 * A plain English name for a colour, e.g. "Red", "Dark blue", "Light grey", "Beige": a starting
 * point for naming a yarn, not an exact description.
 */
export function colourName(c: OKLab): string {
  const chroma = Math.hypot(c.a, c.b)
  if (chroma < NEUTRAL_CHROMA) {
    if (c.L >= 0.95) return 'White'
    if (c.L < 0.25) return 'Black'
    if (c.L >= 0.75) return 'Light grey'
    if (c.L < 0.45) return 'Dark grey'
    return 'Grey'
  }
  const deg = ((Math.atan2(c.b, c.a) * 180) / Math.PI + 360) % 360
  let hue = HUES.find(([max]) => deg < max)![1]

  // Names people use for some lightness and colourfulness ranges of a hue.
  const warm = hue === 'Orange' || hue === 'Yellow'
  if ((warm || hue === 'Red') && c.L > 0.75 && chroma < 0.08) return 'Beige'
  if (hue === 'Red' && c.L > 0.75) hue = 'Pink'
  if (hue === 'Orange' && c.L < 0.6) hue = 'Brown'
  if (hue === 'Yellow' && c.L < 0.65) hue = 'Olive'

  // Yellow, beige and pink are light by nature: "light" would add nothing.
  if (c.L < 0.45) return `Dark ${hue.toLowerCase()}`
  if (c.L > 0.8 && hue !== 'Yellow' && hue !== 'Pink') return `Light ${hue.toLowerCase()}`
  return hue
}
