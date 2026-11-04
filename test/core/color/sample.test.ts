import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { deltaE } from '../../../src/core/color/distance'
import { sampleColour } from '../../../src/core/color/sample'
import { seededRandom } from '../../../src/core/random'
import type { ImageGrid } from '../../../src/core/types'

/** A 40 × 40 patch of one colour with seeded noise and 10% white highlight pixels. */
function noisyPatch(): ImageGrid {
  const random = seededRandom(3)
  const data = new Uint8ClampedArray(40 * 40 * 4)
  for (let p = 0; p < 1600; p++) {
    const highlight = random() < 0.1
    const n = () => (random() - 0.5) * 16
    data.set(highlight ? [255, 255, 255, 255] : [60 + n(), 120 + n(), 200 + n(), 255], p * 4)
  }
  return { width: 40, height: 40, data }
}

describe('sampleColour', () => {
  it('ignores highlights and noise: within deltaE 2 of the true colour', () => {
    const c = sampleColour(noisyPatch(), { x: 20, y: 20 }, 6)
    expect(deltaE(c, srgbToOklab({ r: 60, g: 120, b: 200 }))).toBeLessThan(2)
  })

  it('gives the exact colour of a flat patch', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4)
    for (let p = 0; p < 100; p++) data.set([255, 215, 0, 255], p * 4)
    const c = sampleColour({ width: 10, height: 10, data }, { x: 5, y: 5 }, 3)
    expect(deltaE(c, srgbToOklab({ r: 255, g: 215, b: 0 }))).toBeLessThan(1e-9)
  })

  it('works at the edge of the image (uses the pixels that exist)', () => {
    const c = sampleColour(noisyPatch(), { x: 0, y: 39 }, 6)
    expect(deltaE(c, srgbToOklab({ r: 60, g: 120, b: 200 }))).toBeLessThan(3)
  })

  it('skips transparent pixels', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4)
    for (let p = 0; p < 100; p++) data.set(p % 10 < 5 ? [255, 0, 0, 0] : [0, 0, 255, 255], p * 4)
    const c = sampleColour({ width: 10, height: 10, data }, { x: 5, y: 5 }, 4)
    expect(deltaE(c, srgbToOklab({ r: 0, g: 0, b: 255 }))).toBeLessThan(1e-9)
  })
})
