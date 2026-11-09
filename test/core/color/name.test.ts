import { describe, expect, it } from 'vitest'
import { hexToRgb, srgbToOklab } from '../../../src/core/color/convert'
import { colourName } from '../../../src/core/color/name'

const name = (hex: string) => colourName(srgbToOklab(hexToRgb(hex)))

describe('colourName', () => {
  it('names the basic hues', () => {
    expect(name('#D62828')).toBe('Red')
    expect(name('#F77F00')).toBe('Orange')
    expect(name('#FFD700')).toBe('Yellow')
    expect(name('#2E9E3E')).toBe('Green')
    expect(name('#2A9D8F')).toBe('Teal')
    expect(name('#2F6FD0')).toBe('Blue')
    expect(name('#7B3FB5')).toBe('Purple')
    expect(name('#E0559A')).toBe('Pink')
  })

  it('names colours without hue', () => {
    expect(name('#FFFFFF')).toBe('White')
    expect(name('#111111')).toBe('Black')
    expect(name('#808080')).toBe('Grey')
    expect(name('#C8C8C8')).toBe('Light grey')
    expect(name('#4A4A4A')).toBe('Dark grey')
  })

  it('names browns, beiges and light reds by what people call them', () => {
    expect(name('#7B4A25')).toBe('Brown')
    expect(name('#E3D3B5')).toBe('Beige')
    expect(name('#F4A6B0')).toBe('Pink')
  })

  it('adds light and dark', () => {
    expect(name('#1D3A6E')).toBe('Dark blue')
    expect(name('#A8D0F5')).toBe('Light blue')
    expect(name('#1E5A2A')).toBe('Dark green')
  })
})
