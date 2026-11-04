import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { deltaE } from '../../../src/core/color/distance'
import { samplePixels } from '../../../src/core/quantize/sample'
import { fitToRug } from '../../../src/core/image/fitToRug'
import type { OKLab, RGB } from '../../../src/core/types'
import {
  FIXTURE,
  circle,
  gradientCircle,
  thinOutline,
  triforce,
  withSoftAlpha,
} from '../../fixtures/images'

/** Share of samples further than deltaE 3 from every one of the given colours. */
function strayShare(samples: OKLab[], colours: RGB[]): number {
  const labs = colours.map(srgbToOklab)
  const stray = samples.filter((s) => labs.every((c) => deltaE(s, c) > 3)).length
  return stray / samples.length
}

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

  it('skips the blended pixels of smooth (anti-aliased) edges', () => {
    // Shrinking blends every edge pixel; those in-between colours are not art colours.
    const smooth = fitToRug(triforce(800), { widthMm: 100, heightMm: 100 }, 1)
    const samples = samplePixels(smooth, Infinity, 1)
    expect(strayShare(samples, [FIXTURE.gold, FIXTURE.dark])).toBeLessThan(0.005)
  })

  it('skips blended pixels when a small image is enlarged', () => {
    const big = fitToRug(triforce(300), { widthMm: 900, heightMm: 900 }, 1)
    const samples = samplePixels(big, 50_000, 1)
    expect(strayShare(samples, [FIXTURE.gold, FIXTURE.dark])).toBeLessThan(0.005)
  })

  it('skips the grey rims of a smooth thin outline, but keeps the line itself', () => {
    const smooth = fitToRug(thinOutline(800, 12), { widthMm: 200, heightMm: 200 }, 1)
    const samples = samplePixels(smooth, Infinity, 1)
    expect(strayShare(samples, [FIXTURE.black, FIXTURE.white, FIXTURE.red])).toBeLessThan(0.005)
    const black = srgbToOklab(FIXTURE.black)
    expect(samples.filter((s) => deltaE(s, black) < 3).length).toBeGreaterThan(500)
  })

  it('keeps a sharp 1 px line (its neighbours on both sides are the same colour)', () => {
    const samples = samplePixels(thinOutline(200, 1), Infinity, 1)
    const black = srgbToOklab(FIXTURE.black)
    expect(samples.filter((s) => deltaE(s, black) < 1).length).toBeGreaterThan(400)
  })

  it('keeps every pixel of a smooth gradient (neighbours differ only a little)', () => {
    expect(samplePixels(gradientCircle(300, 256), Infinity, 1)).toHaveLength(300 * 300)
  })
})
