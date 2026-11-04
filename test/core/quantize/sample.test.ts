import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { deltaE } from '../../../src/core/color/distance'
import { samplePixels } from '../../../src/core/quantize/sample'
import { FIXTURE, circle, triforce, withSoftAlpha } from '../../fixtures/images'

describe('samplePixels', () => {
  it('returns maxSamples samples when the image has more pixels', () => {
    expect(samplePixels(triforce(200), 1000, 1)).toHaveLength(1000)
  })

  it('returns every pixel once when the image has fewer', () => {
    expect(samplePixels(triforce(20), 1000, 1)).toHaveLength(400)
  })

  it('returns colours from the image, in OKLab', () => {
    const gold = srgbToOklab(FIXTURE.gold)
    const dark = srgbToOklab(FIXTURE.dark)
    for (const s of samplePixels(triforce(100), 500, 1)) {
      expect(Math.min(deltaE(s, gold), deltaE(s, dark))).toBeLessThan(1e-9)
    }
  })

  it('samples evenly: gold share in the sample matches the image within 3%', () => {
    const img = triforce(300)
    let goldPixels = 0
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i] === FIXTURE.gold.r) goldPixels++
    const gold = srgbToOklab(FIXTURE.gold)
    const samples = samplePixels(img, 5000, 1)
    const goldSamples = samples.filter((s) => deltaE(s, gold) < 1).length
    expect(Math.abs(goldSamples / samples.length - goldPixels / (300 * 300))).toBeLessThan(0.03)
  })

  it('skips pixels under 50% alpha', () => {
    const soft = withSoftAlpha(circle(100), 3)
    let opaque = 0
    for (let p = 0; p < 100 * 100; p++) if (soft.data[p * 4 + 3] >= 128) opaque++
    const samples = samplePixels(soft, 100_000, 1)
    expect(samples).toHaveLength(opaque)
    const white = srgbToOklab(FIXTURE.white)
    expect(samples.every((s) => deltaE(s, white) > 10)).toBe(true)
  })

  it('gives the same samples for the same seed and different ones for another seed', () => {
    const img = triforce(200)
    expect(samplePixels(img, 300, 7)).toEqual(samplePixels(img, 300, 7))
    expect(samplePixels(img, 300, 7)).not.toEqual(samplePixels(img, 300, 8))
  })
})
