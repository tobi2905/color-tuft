import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../src/core/color/convert'
import type { PaletteEntry } from '../../src/core/types'
import { yarnChoice } from '../../src/ui/yarnChoice'

const black = srgbToOklab({ r: 0, g: 0, b: 0 })
const palette: PaletteEntry[] = [
  {
    number: 1,
    name: 'Gold',
    lab: srgbToOklab({ r: 255, g: 215, b: 0 }),
    hex: '#FFD700',
    locked: false,
  },
  { number: 2, name: 'Black', lab: black, hex: '#000000', locked: false },
]

describe('yarnChoice', () => {
  it('is automatic when no colour is chosen', () => {
    expect(yarnChoice(null, palette, false)).toBe('auto')
  })

  it('names the palette colour a chosen colour matches', () => {
    expect(yarnChoice(black, palette, false)).toBe('2')
  })

  it('is "other" for a colour that is in no palette entry', () => {
    expect(yarnChoice(srgbToOklab({ r: 40, g: 90, b: 200 }), palette, false)).toBe('other')
  })

  it('stays "other" after choosing it, even while the colour matches a palette colour', () => {
    // Switching from Black to "Other colour…" starts from black: it must not jump back to Black.
    expect(yarnChoice(black, palette, true)).toBe('other')
  })

  it('is automatic when automatic was chosen, even after "other" before', () => {
    expect(yarnChoice(null, palette, true)).toBe('auto')
  })
})
