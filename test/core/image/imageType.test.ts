import { describe, expect, it } from 'vitest'
import { UNSUPPORTED_IMAGE_MESSAGE, checkImageType } from '../../../src/core/image/imageType'

describe('checkImageType', () => {
  it.each([
    ['image/png', 'art.png'],
    ['image/jpeg', 'photo.jpg'],
    ['image/webp', 'icon.webp'],
  ])('accepts %s', (type, name) => {
    expect(() => checkImageType(type, name)).not.toThrow()
  })

  it.each(['art.png', 'photo.JPG', 'photo.jpeg', 'icon.webp'])(
    'falls back to the extension when the type is missing: %s',
    (name) => {
      expect(() => checkImageType('', name)).not.toThrow()
    },
  )

  it.each([
    ['image/gif', 'anim.gif'],
    ['image/svg+xml', 'logo.svg'],
    ['image/heic', 'IMG_0001.heic'],
    ['application/pdf', 'art.pdf'],
    ['', 'notes.txt'],
    ['', 'no-extension'],
  ])('rejects %s (%s) with the plain message', (type, name) => {
    expect(() => checkImageType(type, name)).toThrow(UNSUPPORTED_IMAGE_MESSAGE)
  })

  it('trusts a known type over a misleading extension', () => {
    expect(() => checkImageType('image/gif', 'sneaky.png')).toThrow(UNSUPPORTED_IMAGE_MESSAGE)
  })
})
