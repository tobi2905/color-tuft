import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { deltaE } from '../../../src/core/color/distance'
import { denoise } from '../../../src/core/image/denoise'
import { fitToRug } from '../../../src/core/image/fitToRug'
import { findPeaks } from '../../../src/core/quantize/peaks'
import { samplePixels } from '../../../src/core/quantize/sample'
import type { ImageGrid } from '../../../src/core/types'
import {
  FIXTURE,
  gradientCircle,
  sixColours,
  smallEye,
  triforce,
  withJpegNoise,
  withSoftAlpha,
} from '../../fixtures/images'

const peaksOf = (img: ImageGrid) => findPeaks(samplePixels(img, 20_000, 1))
const significant = (img: ImageGrid) => peaksOf(img).filter((p) => p.share >= 0.002)

describe('findPeaks', () => {
  it('finds the 2 colours of the Triforce, near their true values', () => {
    const peaks = peaksOf(triforce(200))
    expect(peaks).toHaveLength(2)
    const gold = srgbToOklab(FIXTURE.gold)
    const dark = srgbToOklab(FIXTURE.dark)
    expect(Math.min(...peaks.map((p) => deltaE(p.lab, gold)))).toBeLessThan(0.5)
    expect(Math.min(...peaks.map((p) => deltaE(p.lab, dark)))).toBeLessThan(0.5)
  })

  it('has shares that add up to 1, largest first', () => {
    const peaks = peaksOf(withJpegNoise(sixColours(150), 12, 3))
    expect(peaks.reduce((sum, p) => sum + p.share, 0)).toBeCloseTo(1, 9)
    for (let i = 1; i < peaks.length; i++)
      expect(peaks[i].share).toBeLessThanOrEqual(peaks[i - 1].share)
  })

  it('finds 6 peaks in sixColours', () => {
    expect(peaksOf(sixColours(150))).toHaveLength(6)
  })

  it('keeps a tiny but distinct eye as its own peak with its real share', () => {
    // Every pixel, not a sample: with ~100 eye samples the share would wobble by ±10%.
    const peaks = findPeaks(samplePixels(smallEye(300, 0.005), Infinity, 1))
    expect(peaks).toHaveLength(3)
    const navy = srgbToOklab(FIXTURE.navy)
    const eye = peaks.find((p) => deltaE(p.lab, navy) < 1)
    expect(eye?.share).toBeGreaterThan(0.004)
    expect(eye?.share).toBeLessThan(0.006)
  })

  it('adds no halo peak for a PNG with soft transparent edges', () => {
    // The background is transparent: only gold is real; the hidden dark must not appear.
    const peaks = peaksOf(withSoftAlpha(triforce(200), 3))
    expect(peaks).toHaveLength(1)
    expect(deltaE(peaks[0].lab, srgbToOklab(FIXTURE.gold))).toBeLessThan(0.5)
  })

  it('finds exactly the 2 real colours in a noisy JPEG after denoising', () => {
    const cleaned = denoise(withJpegNoise(triforce(200), 12, 1), { radiusPx: 2, rangeDeltaE: 10 })
    expect(significant(cleaned)).toHaveLength(2)
  })

  it('marks both Triforce colours as distinct', () => {
    expect(peaksOf(triforce(200)).every((p) => p.distinct)).toBe(true)
  })

  it('marks a gradient as one distinct colour, however many peaks it has', () => {
    // White background + one gradient island = 2 distinct, even though the gradient has
    // several peaks of its own.
    const peaks = peaksOf(gradientCircle(300, 64))
    expect(peaks.length).toBeGreaterThan(3)
    expect(peaks.filter((p) => p.distinct)).toHaveLength(2)
  })

  it('marks noise specks as not distinct', () => {
    const cleaned = denoise(withJpegNoise(triforce(200), 12, 1), { radiusPx: 2, rangeDeltaE: 10 })
    expect(peaksOf(cleaned).filter((p) => p.distinct)).toHaveLength(2)
  })

  it('does not let blended anti-aliased edge pixels join the two Triforce colours', () => {
    const smooth = fitToRug(triforce(800), { widthMm: 200, heightMm: 200 }, 1)
    expect(peaksOf(smooth).filter((p) => p.distinct && p.share >= 0.002)).toHaveLength(2)
  })

  it('returns nothing for no samples', () => {
    expect(findPeaks([])).toEqual([])
  })
})
