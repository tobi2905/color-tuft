import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { CLOSE, VERY_CLOSE, deltaE, matchRating } from '../../../src/core/color/distance'

const lab = (r: number, g: number, b: number) => srgbToOklab({ r, g, b })

describe('deltaE', () => {
  it('is 0 for identical colours', () => {
    const gold = lab(255, 215, 0)
    expect(deltaE(gold, gold)).toBe(0)
  })

  it('is the same in both directions', () => {
    const a = lab(30, 60, 200)
    const b = lab(220, 120, 40)
    expect(deltaE(a, b)).toBe(deltaE(b, a))
  })

  it('is the straight-line distance in OKLab, times 100', () => {
    // A 3-4-5 triangle: 0.03 apart in a, 0.04 in b, so 0.05 apart, times 100.
    expect(deltaE({ L: 0.5, a: 0, b: 0 }, { L: 0.5, a: 0.03, b: 0.04 })).toBeCloseTo(5, 9)
  })

  it('sees dark blues as far more different than yellows the same RGB distance apart', () => {
    const navy = deltaE(lab(0, 0, 40), lab(0, 0, 80))
    const yellow = deltaE(lab(255, 255, 0), lab(255, 255, 40))
    expect(navy).toBeGreaterThan(10 * yellow)
  })
})

describe('matchRating', () => {
  it('rates identical colours very close', () => {
    const gold = lab(255, 215, 0)
    expect(matchRating(deltaE(gold, gold))).toBe('very-close')
  })

  it('rates black against white noticeable', () => {
    expect(matchRating(deltaE(lab(0, 0, 0), lab(255, 255, 255)))).toBe('noticeable')
  })

  it('treats the thresholds as "under": exactly 3 is close, exactly 8 is noticeable', () => {
    expect(matchRating(VERY_CLOSE - 0.001)).toBe('very-close')
    expect(matchRating(VERY_CLOSE)).toBe('close')
    expect(matchRating(CLOSE - 0.001)).toBe('close')
    expect(matchRating(CLOSE)).toBe('noticeable')
  })
})
