import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { mixDistance } from '../../../src/core/color/mix'

const lab = (r: number, g: number, b: number) => srgbToOklab({ r, g, b })
const gold = lab(255, 215, 0)
const dark = lab(27, 27, 27)

describe('mixDistance', () => {
  it('is about 0 for a half-half mix of the sRGB values (how most apps blend edges)', () => {
    const half = lab((255 + 27) / 2, (215 + 27) / 2, (0 + 27) / 2)
    expect(mixDistance(half, gold, dark)).toBeLessThan(1)
  })

  it('is about 0 for a half-half mix in linear light', () => {
    const lin = (v: number) => ((v / 255 + 0.055) / 1.055) ** 2.4
    const enc = (x: number) => 255 * (1.055 * x ** (1 / 2.4) - 0.055)
    const mixChannel = (a: number, b: number) => enc((lin(a) + lin(b)) / 2)
    const half = lab(mixChannel(255, 27), mixChannel(215, 27), mixChannel(0, 27))
    expect(mixDistance(half, gold, dark)).toBeLessThan(1)
  })

  it('is 0 for either end itself', () => {
    expect(mixDistance(gold, gold, dark)).toBeLessThan(1e-3)
    expect(mixDistance(dark, gold, dark)).toBeLessThan(1e-3)
  })

  it('is large for a colour that is no mix of the two', () => {
    expect(mixDistance(lab(40, 100, 220), gold, dark)).toBeGreaterThan(20)
  })
})
