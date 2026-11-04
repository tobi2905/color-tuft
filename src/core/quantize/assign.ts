import { srgbToOklab } from '../color/convert'
import { deltaE } from '../color/distance'
import { type ImageGrid, type LabelMap, NO_LABEL, type OKLab } from '../types'

/** Working resolution of the colour map: 1 mm per pixel. */
export const FINE_MM_PER_PX = 1

/**
 * The colour map: each pixel gets the index of its nearest palette colour (by deltaE),
 * pixels under 50 % alpha get NO_LABEL (outside the rug). No dithering: every pixel is
 * one solid colour.
 *
 * Flat art has few distinct pixel colours, so the answer for each colour is remembered
 * and reused instead of converted again for every pixel.
 */
export function assignLabels(img: ImageGrid, palette: OKLab[], mmPerPx: number): LabelMap {
  if (palette.length === 0 || palette.length >= NO_LABEL) {
    throw new Error(`A palette needs 1 to ${NO_LABEL - 1} colours, got ${palette.length}.`)
  }
  const { width, height, data } = img
  const labels = new Uint8Array(width * height)
  // Remembered answers, one byte per possible RGB colour (16 MB): label + 1, 0 = not yet known.
  const known = new Uint8Array(1 << 24)

  for (let p = 0; p < width * height; p++) {
    if (data[p * 4 + 3] < 128) {
      labels[p] = NO_LABEL
      continue
    }
    const r = data[p * 4]
    const g = data[p * 4 + 1]
    const b = data[p * 4 + 2]
    const key = (r << 16) | (g << 8) | b
    if (known[key] === 0) known[key] = nearest(srgbToOklab({ r, g, b }), palette) + 1
    labels[p] = known[key] - 1
  }
  return { width, height, mmPerPx, labels }
}

function nearest(c: OKLab, palette: OKLab[]): number {
  let best = 0
  let bestD = Infinity
  palette.forEach((x, i) => {
    const d = deltaE(c, x)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}
