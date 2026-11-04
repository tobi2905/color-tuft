import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { deltaE } from '../../../src/core/color/distance'
import { denoise } from '../../../src/core/image/denoise'
import type { ImageGrid, RGB } from '../../../src/core/types'
import { FIXTURE, circle, triforce, withJpegNoise, withSoftAlpha } from '../../fixtures/images'

const OPTS = { radiusPx: 2, rangeDeltaE: 10 }

const rgbAt = (img: ImageGrid, p: number): RGB => ({
  r: img.data[p * 4],
  g: img.data[p * 4 + 1],
  b: img.data[p * 4 + 2],
})
const dist = (a: RGB, b: RGB) => deltaE(srgbToOklab(a), srgbToOklab(b))

describe('denoise', () => {
  const clean = triforce(200)
  const noisy = withJpegNoise(clean, 12, 1)
  const out = denoise(noisy, OPTS)
  const n = clean.width * clean.height

  it('the noisy test image really is noisy (so the next tests mean something)', () => {
    let off = 0
    for (let p = 0; p < n; p++) if (dist(rgbAt(noisy, p), rgbAt(clean, p)) >= 3) off++
    expect(off / n).toBeGreaterThan(0.2)
  })

  it('brings at least 99% of pixels within deltaE 3 of their true colour', () => {
    let close = 0
    for (let p = 0; p < n; p++) if (dist(rgbAt(out, p), rgbAt(clean, p)) < 3) close++
    expect(close / n).toBeGreaterThanOrEqual(0.99)
  })

  it('keeps every pixel on its own side of an edge, even right next to it', () => {
    for (let p = 0; p < n; p++) {
      const truth = rgbAt(clean, p)
      const other = truth.r === FIXTURE.gold.r ? FIXTURE.dark : FIXTURE.gold
      const c = rgbAt(out, p)
      expect(dist(c, truth)).toBeLessThan(dist(c, other))
    }
  })

  it('keeps edges sharp: pixels 2 px from an edge stay within deltaE 3 of their side', () => {
    const w = clean.width
    const isGold = (x: number, y: number) => clean.data[(y * w + x) * 4] === FIXTURE.gold.r
    let checked = 0
    for (let y = 2; y < w - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        // Exactly 2 px from an edge: a different colour 2 px away, none 1 px away.
        const here = isGold(x, y)
        const near = [isGold(x + 1, y), isGold(x - 1, y), isGold(x, y + 1), isGold(x, y - 1)]
        const far = [isGold(x + 2, y), isGold(x - 2, y), isGold(x, y + 2), isGold(x, y - 2)]
        if (near.some((v) => v !== here) || far.every((v) => v === here)) continue
        checked++
        expect(dist(rgbAt(out, y * w + x), rgbAt(clean, y * w + x))).toBeLessThan(3)
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('leaves a flat, clean image exactly as it is', () => {
    const flat = triforce(60)
    expect(denoise(flat, OPTS).data).toEqual(flat.data)
  })

  it('leaves alpha untouched and ignores the colour hidden in transparent pixels', () => {
    const soft = withSoftAlpha(circle(120), 3)
    const result = denoise(soft, OPTS)
    for (let p = 0; p < 120 * 120; p++) {
      expect(result.data[p * 4 + 3]).toBe(soft.data[p * 4 + 3])
      if (soft.data[p * 4 + 3] > 0) expect(dist(rgbAt(result, p), FIXTURE.red)).toBeLessThan(1)
    }
  })

  it('ignores hidden colour in transparent pixels even when it is similar to the art', () => {
    // Red disk on an almost-red background, then the background made transparent. The
    // hidden colour is close enough that only alpha weighting keeps it out.
    const nearRed = { r: 230, g: 60, b: 50 }
    const base = circle(120)
    for (let p = 0; p < 120 * 120; p++) {
      if (base.data[p * 4] === FIXTURE.white.r)
        base.data.set([nearRed.r, nearRed.g, nearRed.b], p * 4)
    }
    const soft = withSoftAlpha(base, 3)
    const hidden = dist(nearRed, FIXTURE.red)
    expect(hidden).toBeGreaterThan(3) // precondition: different enough to matter...
    expect(hidden).toBeLessThan(10) // ...but similar enough to pass the colour weight

    const result = denoise(soft, OPTS)
    for (let p = 0; p < 120 * 120; p++) {
      if (soft.data[p * 4 + 3] > 0) expect(dist(rgbAt(result, p), FIXTURE.red)).toBeLessThan(0.5)
    }
  })

  it.each([
    { radiusPx: -1, rangeDeltaE: 10 },
    { radiusPx: 2, rangeDeltaE: 0 },
    { radiusPx: Number.NaN, rangeDeltaE: 10 },
  ])('rejects invalid settings %o', (opts) => {
    expect(() => denoise(triforce(20), opts)).toThrow()
  })

  it('does not change the input', () => {
    const before = new Uint8ClampedArray(noisy.data)
    denoise(noisy, OPTS)
    expect(noisy.data).toEqual(before)
  })
})
