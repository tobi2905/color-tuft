import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { deltaE } from '../../../src/core/color/distance'
import { denoise } from '../../../src/core/image/denoise'
import { fitToRug } from '../../../src/core/image/fitToRug'
import { bestNextColour, findPalette } from '../../../src/core/quantize/palette'
import { findPeaks } from '../../../src/core/quantize/peaks'
import { samplePixels } from '../../../src/core/quantize/sample'
import type { ImageGrid, OKLab, RGB } from '../../../src/core/types'
import {
  FIXTURE,
  gradientCircle,
  sixColours,
  smallEye,
  thinOutline,
  triforce,
  twoToneShading,
  withJpegNoise,
} from '../../fixtures/images'

const samplesOf = (img: ImageGrid) => samplePixels(img, 20_000, 1)
const palette = (img: ImageGrid, count: number, locked: OKLab[] = []) =>
  findPalette(samplesOf(img), { count, locked, seed: 1 })

/** Distance from `c` to the closest palette colour. */
const closest = (pal: OKLab[], c: RGB) => Math.min(...pal.map((p) => deltaE(p, srgbToOklab(c))))

describe('findPalette', () => {
  it('returns only the 2 real colours of the Triforce when asked for 7', () => {
    const pal = palette(triforce(200), 7)
    expect(pal).toHaveLength(2)
    expect(closest(pal, FIXTURE.gold)).toBeLessThan(0.5)
    expect(closest(pal, FIXTURE.dark)).toBeLessThan(0.5)
  })

  it('returns only 2 colours for a noisy JPEG Triforce after denoising', () => {
    const cleaned = denoise(withJpegNoise(triforce(200), 12, 1), { radiusPx: 2, rangeDeltaE: 10 })
    const pal = palette(cleaned, 7)
    expect(pal).toHaveLength(2)
    expect(closest(pal, FIXTURE.gold)).toBeLessThan(2)
  })

  it('returns only 2 colours for a Triforce with smooth, anti-aliased edges', () => {
    // Shrinking blends the edge pixels into in-between colours; those are not art colours.
    const smooth = fitToRug(triforce(800), { widthMm: 200, heightMm: 200 }, 1)
    expect(palette(smooth, 7)).toHaveLength(2)
  })

  it('keeps a tiny distinct eye (0.5% of the image) when asked for 3 colours', () => {
    const pal = palette(smallEye(300, 0.005), 3)
    expect(pal).toHaveLength(3)
    expect(closest(pal, FIXTURE.navy)).toBeLessThan(1)
  })

  it('keeps a tiny distinct dot even when a gradient competes for the colours', () => {
    // Splitting a gradient alone would spend every colour on blue bands and lose the dot.
    const size = 300
    const img = gradientCircle(size, 64)
    const dotRadius = Math.sqrt((0.005 * size * size) / Math.PI)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.hypot(x + 0.5 - 60, y + 0.5 - 60) < dotRadius) {
          img.data.set([FIXTURE.red.r, FIXTURE.red.g, FIXTURE.red.b], (y * size + x) * 4)
        }
      }
    }
    for (const seed of [1, 2, 3, 4, 5]) {
      const pal = findPalette(samplesOf(img), { count: 4, locked: [], seed })
      expect(closest(pal, FIXTURE.red)).toBeLessThan(1)
    }
  })

  it('keeps both tones of two-tone shading at the suggested count', () => {
    const pal = palette(twoToneShading(400, 20), 4)
    expect(closest(pal, FIXTURE.mint)).toBeLessThan(2)
    expect(closest(pal, FIXTURE.darkGreen)).toBeLessThan(2)
    expect(closest(pal, FIXTURE.gold)).toBeLessThan(2)
  })

  it('finds all six colours of sixColours', () => {
    const pal = palette(sixColours(150), 6)
    expect(pal).toHaveLength(6)
    const all = [
      FIXTURE.red,
      FIXTURE.green,
      FIXTURE.blue,
      FIXTURE.gold,
      FIXTURE.black,
      FIXTURE.white,
    ]
    for (const c of all) expect(closest(pal, c)).toBeLessThan(0.5)
  })

  it('splits a gradient into 4 solid colours, ordered from light to dark', () => {
    const pal = palette(gradientCircle(300, 64), 4)
    expect(pal).toHaveLength(4)
    for (let i = 1; i < pal.length; i++) expect(pal[i].L).toBeLessThan(pal[i - 1].L)
    // Never near-duplicates: every pair clearly different.
    for (let i = 0; i < pal.length; i++) {
      for (let j = i + 1; j < pal.length; j++) expect(deltaE(pal[i], pal[j])).toBeGreaterThan(5)
    }
  })

  it('splits a smooth gradient into 8 bands when asked', () => {
    // Each band is small, but no smaller than its neighbours: bands, not edge blends.
    expect(palette(gradientCircle(600, 256), 8)).toHaveLength(8)
  })

  it('stops splitting a gradient when bands would be closer than deltaE 5', () => {
    const pal = palette(gradientCircle(600, 256), 16)
    expect(pal.length).toBeLessThan(16)
    for (let i = 1; i < pal.length; i++) expect(deltaE(pal[i], pal[i - 1])).toBeGreaterThan(5)
  })

  it.each([
    ['shrunk 8×', 800, 100],
    ['enlarged 3×', 300, 900],
  ])('returns only 2 colours for a Triforce %s (blended edges)', (_, src, mm) => {
    const img = fitToRug(triforce(src), { widthMm: mm, heightMm: mm }, 1)
    expect(palette(img, 7)).toHaveLength(2)
  })

  it('returns only the 3 real colours of a smooth thin outline', () => {
    const smooth = fitToRug(thinOutline(800, 12), { widthMm: 200, heightMm: 200 }, 1)
    expect(palette(smooth, 6)).toHaveLength(3)
  })

  it('returns a locked colour exactly as given, even when it is not in the art', () => {
    const red = srgbToOklab(FIXTURE.red)
    const pal = palette(triforce(200), 3, [red])
    expect(pal).toContainEqual(red)
    expect(closest(pal, FIXTURE.gold)).toBeLessThan(0.5)
    expect(closest(pal, FIXTURE.dark)).toBeLessThan(0.5)
  })

  it('does not add a near-duplicate next to a locked colour close to an art colour', () => {
    // A yarn colour slightly off the gold (about deltaE 3) is locked; it stands in for the gold.
    const yarn = srgbToOklab({ r: 245, g: 205, b: 20 })
    expect(deltaE(yarn, srgbToOklab(FIXTURE.gold))).toBeLessThan(5)
    const pal = palette(triforce(200), 5, [yarn])
    expect(pal).toHaveLength(2)
    expect(pal).toContainEqual(yarn)
  })

  it('always returns all locked colours, even if there are more than count', () => {
    const locked = [FIXTURE.red, FIXTURE.green, FIXTURE.blue].map(srgbToOklab)
    const pal = palette(triforce(100), 2, locked)
    for (const c of locked) expect(pal).toContainEqual(c)
  })

  it('returns one colour when asked for one', () => {
    expect(palette(sixColours(90), 1)).toHaveLength(1)
  })

  it('gives the same palette for the same seed', () => {
    const samples = samplesOf(gradientCircle(200, 64))
    const opts = { count: 5, locked: [], seed: 3 }
    expect(findPalette(samples, opts)).toEqual(findPalette(samples, opts))
  })

  it('still works when every peak is tiny (colours scattered everywhere)', () => {
    // A grid 3 histogram cubes apart: every colour is its own peak with share 1/1600 (< 0.2%).
    const scattered: OKLab[] = []
    for (let l = 0; l < 16; l++) {
      for (let a = 0; a < 10; a++) {
        for (let b = 0; b < 10; b++) {
          scattered.push({ L: 0.05 + 0.06 * l, a: -0.27 + 0.06 * a, b: -0.27 + 0.06 * b })
        }
      }
    }
    expect(findPeaks(scattered).every((p) => p.share < 0.002)).toBe(true)
    const pal = findPalette(scattered, { count: 3, locked: [], seed: 1 })
    expect(pal).toHaveLength(3)
    for (const c of pal) expect(Number.isFinite(c.L + c.a + c.b)).toBe(true)
  })

  it('returns just the locked colours when there are no samples', () => {
    const red = srgbToOklab(FIXTURE.red)
    expect(findPalette([], { count: 4, locked: [red], seed: 1 })).toEqual([red])
  })

  it.each([
    ['gradient', () => gradientCircle(300, 64), 7],
    ['six colours', () => sixColours(150), 5],
    ['small eye', () => smallEye(300, 0.005), 3],
  ])('adds exactly one colour per step and never moves the others (%s)', (_, make, upTo) => {
    const samples = samplesOf(make())
    for (let n = 1; n < upTo; n++) {
      const smaller = findPalette(samples, { count: n, locked: [], seed: 1 })
      const bigger = findPalette(samples, { count: n + 1, locked: [], seed: 1 })
      for (const c of smaller) expect(bigger).toContainEqual(c)
      expect(bigger.length - smaller.length).toBeLessThanOrEqual(1)
    }
  })

  it('has no randomness left: any seed gives the same palette', () => {
    const samples = samplesOf(gradientCircle(300, 64))
    const a = findPalette(samples, { count: 6, locked: [], seed: 1 })
    const b = findPalette(samples, { count: 6, locked: [], seed: 99 })
    expect(a).toEqual(b)
  })
})

describe('bestNextColour', () => {
  const at = (L: number, a = 0, b = 0) => ({ L, a, b })
  const many = (c: { L: number; a: number; b: number }, n: number) =>
    Array.from({ length: n }, () => c)

  it('picks the colour that brings all samples closest to the palette (checked by brute force)', () => {
    const groups = [
      { colour: at(0.2), n: 100 },
      { colour: at(0.8), n: 100 },
      { colour: at(0.55, 0.05), n: 40 },
      { colour: at(0.95, 0, 0.1), n: 8 },
      { colour: at(0.35, -0.1), n: 25 },
    ]
    const samples = groups.flatMap((g) => many(g.colour, g.n))
    const palette = [at(0.2), at(0.8)]
    const errorWith = (pal: typeof palette) =>
      samples.reduce((sum, s) => sum + Math.min(...pal.map((c) => deltaE(s, c) ** 2)), 0)
    const best = groups
      .map((g) => g.colour)
      .filter((c) => !palette.some((p) => deltaE(p, c) < 5))
      .reduce((a, b) => (errorWith([...palette, b]) < errorWith([...palette, a]) ? b : a))
    const chosen = bestNextColour(samples, palette)!
    expect(deltaE(chosen, best)).toBeLessThan(0.5)
  })

  it('suggests nothing when every sample is already close to a palette colour', () => {
    const samples = [...many(at(0.2), 50), ...many(at(0.21), 50), ...many(at(0.8), 50)]
    expect(bestNextColour(samples, [at(0.2), at(0.8)])).toBeNull()
  })
})
