import { describe, expect, it } from 'vitest'
import { photoPixelAt, photoSampleRadius, sampleHex } from '../../src/ui/yarn/photoSample'

const box = { left: 100, top: 50, width: 400, height: 300 }
const photo = { width: 800, height: 600 }

describe('photo sampling', () => {
  it('turns a click on the shown photo into a pixel of the full photo', () => {
    expect(photoPixelAt({ x: 100, y: 50 }, box, photo)).toEqual({ x: 0, y: 0 })
    expect(photoPixelAt({ x: 300, y: 200 }, box, photo)).toEqual({ x: 400, y: 300 })
  })

  it('gives null for a click outside the photo', () => {
    expect(photoPixelAt({ x: 99, y: 60 }, box, photo)).toBeNull()
    expect(photoPixelAt({ x: 500, y: 60 }, box, photo)).toBeNull() // right edge is outside
  })

  it('samples a patch about 2% of the photo across, at least 3 px', () => {
    expect(photoSampleRadius({ width: 4000, height: 3000 })).toBe(30)
    expect(photoSampleRadius({ width: 100, height: 80 })).toBe(3)
  })

  it('gives the colour code of the sampled spot, ignoring highlights', () => {
    // 20 × 20 photo of one colour with a few white pixels around the click.
    const data = new Uint8ClampedArray(20 * 20 * 4)
    for (let p = 0; p < 400; p++)
      data.set(p % 9 === 0 ? [255, 255, 255, 255] : [214, 40, 40, 255], p * 4)
    expect(sampleHex({ width: 20, height: 20, data }, { x: 10, y: 10 })).toBe('#D62828')
  })

  it('gives null where the photo is transparent', () => {
    const data = new Uint8ClampedArray(20 * 20 * 4) // all alpha 0
    expect(sampleHex({ width: 20, height: 20, data }, { x: 10, y: 10 })).toBeNull()
  })
})
