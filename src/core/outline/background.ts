import { srgbToOklab } from '../color/convert'
import { deltaE } from '../color/distance'
import type { ImageGrid, OKLab } from '../types'

export type BackgroundMethod = 'alpha' | 'edge-colour' | 'none'

/** Pixels this close (deltaE) to the background colour count as background (JPEG noise included). */
export const BACKGROUND_DELTA_E = 6
/** The background colour must cover at least this share of the border pixels. */
export const MIN_BORDER_SHARE = 0.6
/** A "background" covering more than this share of the image is no background at all. */
const MAX_BACKGROUND_SHARE = 0.95
/** At most this many border colours are tried as the background colour. */
const MAX_CANDIDATES = 200

/**
 * Which pixels of the ORIGINAL image are background (mask 1), for shaped rugs. Run before
 * fitting to the rug: fitting adds transparent padding, which would look like transparency.
 *
 * 1. 'alpha': the image has transparency, so pixels under 50 % alpha are the background.
 * 2. 'edge-colour': otherwise, if one colour covers at least 60 % of the border pixels (within
 *    deltaE 6), flood inwards from the border through that colour, like a magic wand. Only
 *    background connected to the edge is found, so white inside a black outline stays art.
 * 3. 'none': no dominant border colour, or the "background" would be nearly the whole image.
 */
export function detectBackground(img: ImageGrid): { mask: Uint8Array; method: BackgroundMethod } {
  const { width: w, height: h, data } = img
  const n = w * h
  const mask = new Uint8Array(n)

  let transparent = 0
  for (let p = 0; p < n; p++) {
    if (data[p * 4 + 3] < 128) {
      mask[p] = 1
      transparent++
    }
  }
  if (transparent > 0) return { mask, method: 'alpha' }

  const lab = (p: number): OKLab =>
    srgbToOklab({ r: data[p * 4], g: data[p * 4 + 1], b: data[p * 4 + 2] })
  const border: number[] = []
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x)
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1)
  const borderLab = border.map(lab)

  // The border colour shared by the most border pixels (candidates: an even spread of them).
  const step = Math.max(1, Math.floor(border.length / MAX_CANDIDATES))
  let best: OKLab | null = null
  let bestCount = 0
  for (let i = 0; i < borderLab.length; i += step) {
    let count = 0
    for (const c of borderLab) if (deltaE(c, borderLab[i]) < BACKGROUND_DELTA_E) count++
    if (count > bestCount) {
      bestCount = count
      best = borderLab[i]
    }
  }
  if (!best || bestCount < MIN_BORDER_SHARE * border.length) {
    return { mask, method: 'none' }
  }

  // Flood fill (4-connected, explicit stack) from every matching border pixel. The answer for
  // each RGB colour is remembered (0 = not yet known, 1 = background, 2 = not), so each colour
  // is converted to OKLab once, however many pixels have it.
  const known = new Uint8Array(1 << 24)
  const isBackground = (p: number) => {
    const key = (data[p * 4] << 16) | (data[p * 4 + 1] << 8) | data[p * 4 + 2]
    if (known[key] === 0) known[key] = deltaE(lab(p), best!) < BACKGROUND_DELTA_E ? 1 : 2
    return known[key] === 1
  }
  const stack: number[] = []
  border.forEach((p, i) => {
    if (!mask[p] && deltaE(borderLab[i], best!) < BACKGROUND_DELTA_E) {
      mask[p] = 1
      stack.push(p)
    }
  })
  let filled = stack.length
  while (stack.length > 0) {
    const p = stack.pop()!
    const x = p % w
    const y = (p - x) / w
    for (const q of [
      x > 0 ? p - 1 : -1,
      x < w - 1 ? p + 1 : -1,
      y > 0 ? p - w : -1,
      y < h - 1 ? p + w : -1,
    ]) {
      if (q === -1 || mask[q] || !isBackground(q)) continue
      mask[q] = 1
      filled++
      stack.push(q)
    }
  }
  if (filled > MAX_BACKGROUND_SHARE * n) return { mask: new Uint8Array(n), method: 'none' }
  return { mask, method: 'edge-colour' }
}
