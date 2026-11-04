export const UNSUPPORTED_IMAGE_MESSAGE = 'Unsupported image type. Use PNG, JPEG or WebP.'

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const SUPPORTED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

/**
 * Throws UNSUPPORTED_IMAGE_MESSAGE unless the file is PNG, JPEG or WebP.
 * Uses the file's type; only when that is missing (some systems leave it empty) the extension.
 */
export function checkImageType(mimeType: string, fileName: string): void {
  const supported = mimeType
    ? SUPPORTED_TYPES.includes(mimeType)
    : SUPPORTED_EXTENSIONS.includes(fileName.split('.').pop()?.toLowerCase() ?? '')
  if (!supported) throw new Error(UNSUPPORTED_IMAGE_MESSAGE)
}
