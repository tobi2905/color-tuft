import { describe, expect, it } from 'vitest'
import { hexToRgb, srgbToOklab } from '../../../src/core/color/convert'
import { findMatches, suggestYarns, yarnsOnlyColours } from '../../../src/core/yarn/match'
import type { Yarn } from '../../../src/core/types'

const lab = (hex: string) => srgbToOklab(hexToRgb(hex))
const yarn = (id: string, hex: string, list: Yarn['list'] = 'stock'): Yarn => ({
  id,
  list,
  name: id,
  number: '',
  hex,
})
const stock = [
  yarn('red', '#D62828'),
  yarn('darkRed', '#8B1A1A'),
  yarn('blue', '#1D4E89'),
  yarn('white', '#FFFFFF'),
]

describe('findMatches', () => {
  it('matches an exact stock colour with deltaE 0, rated very close', () => {
    const [best] = findMatches(lab('#1D4E89'), stock)
    expect(best.yarn.id).toBe('blue')
    expect(best.deltaE).toBeCloseTo(0, 9)
    expect(best.rating).toBe('very-close')
  })

  it('sorts by distance and returns at most n', () => {
    const matches = findMatches(lab('#C02222'), stock, 3)
    expect(matches).toHaveLength(3)
    expect(matches.map((m) => m.yarn.id).slice(0, 2)).toEqual(['red', 'darkRed'])
    for (let i = 1; i < matches.length; i++)
      expect(matches[i].deltaE).toBeGreaterThanOrEqual(matches[i - 1].deltaE)
  })

  it('rates in words: close and noticeable difference', () => {
    expect(findMatches(lab('#C03434'), stock)[0].rating).toBe('close')
    expect(findMatches(lab('#2E9E3E'), stock)[0].rating).toBe('noticeable')
  })

  it('gives nothing for no yarns', () => {
    expect(findMatches(lab('#000000'), [])).toEqual([])
  })
})

describe('suggestYarns', () => {
  it('suggests the nearest stock yarn for each palette colour', () => {
    const s = suggestYarns([lab('#FFFFFF'), lab('#D62828')], stock)
    expect(s.map((x) => x.yarnId)).toEqual(['white', 'red'])
    expect(s.every((x) => !x.collision)).toBe(true)
  })

  it('gives null for a colour with no yarn under deltaE 8', () => {
    const [green] = suggestYarns([lab('#2E9E3E')], stock)
    expect(green.yarnId).toBeNull()
    expect(green.deltaE).toBeGreaterThanOrEqual(8)
  })

  it('marks a collision when two very different colours land on the same yarn', () => {
    // Two reds 12.5 apart, each within 7 of the one red yarn, with only one red yarn in stock.
    const reds = [lab('#EA4A30'), lab('#BA2030')]
    const oneRed = [yarn('red', '#D62828'), yarn('blue', '#1D4E89')]
    const s = suggestYarns(reds, oneRed)
    expect(s.map((x) => x.yarnId)).toEqual(['red', 'red'])
    expect(s.map((x) => x.collision)).toEqual([true, true])
  })

  it('does not mark two nearly equal colours sharing a yarn as a collision', () => {
    const s = suggestYarns([lab('#D62828'), lab('#D82A2A')], stock)
    expect(s.map((x) => x.collision)).toEqual([false, false])
  })

  it('only uses stock yarns', () => {
    const [s] = suggestYarns([lab('#2E9E3E')], [...stock, yarn('green', '#2E9E3E', 'catalogue')])
    expect(s.yarnId).toBeNull()
  })
})

describe('yarnsOnlyColours', () => {
  it('maps every palette colour to its nearest stock yarn, each yarn once', () => {
    const chosen = yarnsOnlyColours([lab('#D62828'), lab('#D02020'), lab('#2E9E3E')], stock)
    // The green has no close yarn but still gets the nearest one: only owned yarns are used.
    expect(chosen.map((c) => c.yarn.id).sort()).toEqual(
      [...new Set(chosen.map((c) => c.yarn.id))].sort(),
    )
    expect(chosen.map((c) => c.yarn.id)).toContain('red')
    expect(chosen.every((c) => c.lab.L === lab(c.yarn.hex).L)).toBe(true)
  })

  it('gives nothing without stock yarns', () => {
    expect(yarnsOnlyColours([lab('#D62828')], [yarn('x', '#D62828', 'catalogue')])).toEqual([])
  })
})
