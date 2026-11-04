import { capSize } from '../core/image/capSize'
import { checkImageType } from '../core/image/imageType'
import type { ImageGrid } from '../core/types'

export const UNREADABLE_IMAGE_MESSAGE = "Couldn't read this image. The file may be damaged."

/**
 * Decodes a PNG, JPEG or WebP file into an ImageGrid (RGBA, sRGB), shrunk so neither side
 * exceeds 4096 px. `downscaled` tells the UI to show a notice.
 * Browser only (createImageBitmap, OffscreenCanvas); also works inside a Web Worker.
 */
export async function loadImageFile(file: File): Promise<{ grid: ImageGrid; downscaled: boolean }> {
  checkImageType(file.type, file.name)

  let bitmap: ImageBitmap
  try {
    // 'none': keep colour values exact at soft edges instead of pre-multiplying them by alpha.
    bitmap = await createImageBitmap(file, { premultiplyAlpha: 'none' })
  } catch {
    throw new Error(UNREADABLE_IMAGE_MESSAGE)
  }

  try {
    const { width, height, downscaled } = capSize(bitmap.width, bitmap.height)
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
    if (!ctx) throw new Error('This browser cannot draw images (no 2D canvas).')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    return { grid: { width, height, data }, downscaled }
  } finally {
    bitmap.close() // free the full-size decoded image right away
  }
}
