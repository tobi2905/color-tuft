import { oklabToSrgb, rgbToHex } from '../../core/color/convert'
import { sampleColour } from '../../core/color/sample'
import type { ImageGrid } from '../../core/types'

type Size = { width: number; height: number }
type Box = Size & { left: number; top: number }

/**
 * A click on the photo as shown on screen (`box`: where it is drawn, in CSS px) to a pixel of
 * the full photo. Null outside it.
 */
export function photoPixelAt(
  click: { x: number; y: number },
  box: Box,
  photo: Size,
): { x: number; y: number } | null {
  const x = ((click.x - box.left) / box.width) * photo.width
  const y = ((click.y - box.top) / box.height) * photo.height
  if (x < 0 || y < 0 || x >= photo.width || y >= photo.height) return null
  return { x, y }
}

/** Radius of the sampled patch: about 2% of the photo across, so it covers part of the cone
 *  (enough for the median to ignore highlights and shadows) without reaching past it. */
export function photoSampleRadius(photo: Size): number {
  return Math.max(3, Math.round(Math.min(photo.width, photo.height) / 100))
}

/** The yarn colour code at a pixel of the photo, or null if that spot is transparent. */
export function sampleHex(photo: ImageGrid, at: { x: number; y: number }): string | null {
  try {
    return rgbToHex(oklabToSrgb(sampleColour(photo, at, photoSampleRadius(photo))))
  } catch {
    return null
  }
}

/**
 * The square kept as the yarn's photo: a quarter of the photo's short side across, centred on
 * the click but moved inside the photo near its edges. In photo pixels.
 */
export function photoCropBox(
  photo: Size,
  at: { x: number; y: number },
): { x: number; y: number; size: number } {
  const size = Math.round(Math.min(photo.width, photo.height) / 4)
  const place = (centre: number, length: number) =>
    Math.min(Math.max(0, Math.round(centre - size / 2)), length - size)
  return { x: place(at.x, photo.width), y: place(at.y, photo.height), size }
}
