import type { ImageGrid } from '../core/types'

/** Side of a saved yarn photo in pixels: sharp as a small thumbnail, only a few kB as JPEG. */
export const YARN_PHOTO_PX = 128

/**
 * A square of an image, scaled to `outPx` and encoded as JPEG (transparent parts become white).
 * Browser only (OffscreenCanvas).
 */
export async function cropToBlob(
  img: ImageGrid,
  box: { x: number; y: number; size: number },
  outPx = YARN_PHOTO_PX,
): Promise<Blob> {
  const full = new OffscreenCanvas(img.width, img.height)
  full
    .getContext('2d')!
    .putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0)
  const out = new OffscreenCanvas(outPx, outPx)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, outPx, outPx)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(full, box.x, box.y, box.size, box.size, 0, 0, outPx, outPx)
  return out.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
}
