import { srgbToOklab } from '../color/convert'
import { deltaE } from '../color/distance'
import type { ImageGrid, Pt, RugSize } from '../types'
import { BACKGROUND_DELTA_E } from './background'

/** A click in the Outline step: make the area at `at` (mm, on the art area) background or art. */
export type BackgroundEdit = { at: Pt; background: boolean }

/**
 * Applies the user's background clicks to a background mask of the original image (1 =
 * background), in order, and returns a new mask.
 * - background: true on art: the touching area of that colour (within deltaE 6, like a magic
 *   wand) becomes background.
 * - background: false on background: that connected patch of opaque background becomes art
 *   again. See-through pixels stay background (the pipeline fills enclosed holes instead).
 * Points are in mm on the art area of `rug`; they are mapped back to image pixels by undoing
 * fitToRug's fit-and-centre.
 */
export function applyBackgroundEdits(
  img: ImageGrid,
  mask: Uint8Array,
  edits: BackgroundEdit[],
  rug: RugSize,
): Uint8Array {
  const out = Uint8Array.from(mask)
  const { width: w, height: h, data } = img
  const fit = Math.min(rug.widthMm / w, rug.heightMm / h) // mm per image pixel
  const left = (rug.widthMm - w * fit) / 2
  const top = (rug.heightMm - h * fit) / 2

  for (const edit of edits) {
    const sx = Math.floor((edit.at.x - left) / fit)
    const sy = Math.floor((edit.at.y - top) / fit)
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
    const start = sy * w + sx
    const lab = (p: number) =>
      srgbToOklab({ r: data[p * 4], g: data[p * 4 + 1], b: data[p * 4 + 2] })

    let joins: (p: number) => boolean
    if (edit.background && !out[start]) {
      const colour = lab(start)
      joins = (p) =>
        !out[p] && data[p * 4 + 3] >= 128 && deltaE(lab(p), colour) < BACKGROUND_DELTA_E
    } else if (!edit.background && out[start] && data[start * 4 + 3] >= 128) {
      // See-through pixels have no colour to bring back: only opaque background returns.
      joins = (p) => out[p] === 1 && data[p * 4 + 3] >= 128
    } else continue // already what was asked

    // Flood fill (4-connected, explicit stack), flipping each pixel as it joins.
    const value = edit.background ? 1 : 0
    const stack = [start]
    out[start] = value
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
        if (q === -1 || out[q] === value || !joins(q)) continue
        out[q] = value
        stack.push(q)
      }
    }
  }
  return out
}
