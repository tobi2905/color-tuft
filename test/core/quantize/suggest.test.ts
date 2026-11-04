import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { deltaE } from '../../../src/core/color/distance'
import { denoise } from '../../../src/core/image/denoise'
import { fitToRug } from '../../../src/core/image/fitToRug'
import { findPalette } from '../../../src/core/quantize/palette'
import { findPeaks } from '../../../src/core/quantize/peaks'
import { samplePixels } from '../../../src/core/quantize/sample'
import { suggestCount } from '../../../src/core/quantize/suggest'
import type { ImageGrid, OKLab } from '../../../src/core/types'
import {
  FIXTURE,
  gradientCircle,
  sixColours,
  smallEye,
  thinOutline,
  triforce,
  withJpegNoise,
} from '../../fixtures/images'

const samplesOf = (img: ImageGrid) => samplePixels(img, 20_000, 1)
const suggest = (img: ImageGrid) => suggestCount(findPeaks(samplesOf(img)))

describe('suggestCount', () => {
  it('suggests 2 for the Triforce', () => {
    expect(suggest(triforce(200))).toBe(2)
  })

  it('suggests 6 for sixColours', () => {
    expect(suggest(sixColours(150))).toBe(6)
  })

  it('counts a tiny distinct eye: 3 for the face', () => {
    expect(suggest(smallEye(300, 0.005))).toBe(3)
  })

  it('suggests 2 for a noisy JPEG Triforce after denoising', () => {
    const cleaned = denoise(withJpegNoise(triforce(200), 12, 1), { radiusPx: 2, rangeDeltaE: 10 })
    expect(suggest(cleaned)).toBe(2)
  })

  it('suggests 3 for a smooth thin outline, not counting its grey rims', () => {
    expect(suggest(fitToRug(thinOutline(800, 12), { widthMm: 200, heightMm: 200 }, 1))).toBe(3)
  })

  it('counts a gradient as one colour', () => {
    // White background + one gradient. More bands are the user's choice.
    expect(suggest(gradientCircle(300, 64))).toBe(2)
  })

  it('gives a count that makes the palette return exactly the real colours', () => {
    const img = smallEye(300, 0.005)
    const samples = samplesOf(img)
    const pal = findPalette(samples, {
      count: suggestCount(findPeaks(samples)),
      locked: [],
      seed: 1,
    })
    for (const c of [FIXTURE.white, FIXTURE.yellow, FIXTURE.navy]) {
      expect(Math.min(...pal.map((p) => deltaE(p, srgbToOklab(c))))).toBeLessThan(1)
    }
  })

  it('never suggests fewer than 2', () => {
    expect(suggestCount([])).toBe(2)
    expect(suggestCount([{ lab: { L: 0.5, a: 0, b: 0 }, share: 1, distinct: true }])).toBe(2)
  })

  it('never suggests more than 16', () => {
    // 20 clearly different flat colours, 5% each.
    const samples: OKLab[] = []
    for (const L of [0.2, 0.4, 0.6, 0.8, 1.0]) {
      for (const [a, b] of [
        [-0.15, -0.15],
        [-0.15, 0.15],
        [0.15, -0.15],
        [0.15, 0.15],
      ]) {
        for (let i = 0; i < 100; i++) samples.push({ L, a, b })
      }
    }
    expect(findPeaks(samples).filter((p) => p.distinct)).toHaveLength(20)
    expect(suggestCount(findPeaks(samples))).toBe(16)
  })

  it('ignores distinct peaks below 0.2%', () => {
    const peaks = [
      { lab: { L: 0.9, a: 0, b: 0 }, share: 0.6, distinct: true },
      { lab: { L: 0.2, a: 0, b: 0 }, share: 0.398, distinct: true },
      { lab: { L: 0.5, a: 0.2, b: 0 }, share: 0.001, distinct: true },
      { lab: { L: 0.5, a: -0.2, b: 0 }, share: 0.001, distinct: true },
    ]
    expect(suggestCount(peaks)).toBe(2)
  })

  it('ignores peaks that are not distinct', () => {
    const peaks = [
      { lab: { L: 0.9, a: 0, b: 0 }, share: 0.5, distinct: true },
      { lab: { L: 0.2, a: 0, b: 0 }, share: 0.3, distinct: true },
      { lab: { L: 0.22, a: 0, b: 0 }, share: 0.1, distinct: false },
      { lab: { L: 0.6, a: 0.2, b: 0 }, share: 0.1, distinct: true },
    ]
    expect(suggestCount(peaks)).toBe(3)
  })
})
