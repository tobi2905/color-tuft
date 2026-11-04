import { describe, expect, it } from 'vitest'
import { hexToRgb, oklabToSrgb, rgbToHex, srgbToOklab } from '../../../src/core/color/convert'
import { seededRandom } from '../../fixtures/random'

describe('hexToRgb', () => {
  it('reads #RRGGBB', () => {
    expect(hexToRgb('#FFD700')).toEqual({ r: 255, g: 215, b: 0 })
  })

  it('accepts lower case', () => {
    expect(hexToRgb('#ffd700')).toEqual({ r: 255, g: 215, b: 0 })
  })

  it('reads black and white', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it.each(['FFD700', '#FFF', '#FFD7000', '#GGGGGG', '', '#FF D7 0'])('rejects %j', (bad) => {
    expect(() => hexToRgb(bad)).toThrow()
  })
})

describe('rgbToHex', () => {
  it('writes upper-case #RRGGBB', () => {
    expect(rgbToHex({ r: 255, g: 215, b: 0 })).toBe('#FFD700')
  })

  it('pads single-digit channels with a zero', () => {
    expect(rgbToHex({ r: 0, g: 10, b: 5 })).toBe('#000A05')
  })

  it('round-trips with hexToRgb', () => {
    expect(rgbToHex(hexToRgb('#1a2b3c'))).toBe('#1A2B3C')
  })
})

describe('srgbToOklab', () => {
  it('gives white L ≈ 1 and no colour', () => {
    const white = srgbToOklab({ r: 255, g: 255, b: 255 })
    expect(white.L).toBeCloseTo(1, 3)
    expect(white.a).toBeCloseTo(0, 3)
    expect(white.b).toBeCloseTo(0, 3)
  })

  it('gives black L = 0', () => {
    const black = srgbToOklab({ r: 0, g: 0, b: 0 })
    expect(black.L).toBe(0)
    expect(black.a).toBeCloseTo(0, 9)
    expect(black.b).toBeCloseTo(0, 9)
  })

  it('matches the published value for pure red', () => {
    // Reference values from Björn Ottosson's OKLab definition.
    const red = srgbToOklab({ r: 255, g: 0, b: 0 })
    expect(red.L).toBeCloseTo(0.62796, 3)
    expect(red.a).toBeCloseTo(0.22486, 3)
    expect(red.b).toBeCloseTo(0.12585, 3)
  })
})

describe('oklabToSrgb', () => {
  it('clamps colours a screen cannot show to whole numbers in 0–255', () => {
    const c = oklabToSrgb({ L: 1, a: 0.4, b: 0 })
    for (const v of [c.r, c.g, c.b]) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }
  })

  it('round-trips 1,000 random colours within 1 per channel', () => {
    const random = seededRandom(42)
    const channel = () => Math.floor(random() * 256)
    for (let i = 0; i < 1000; i++) {
      const rgb = { r: channel(), g: channel(), b: channel() }
      const back = oklabToSrgb(srgbToOklab(rgb))
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1)
    }
  })
})
