import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../src/core/color/convert'
import type { PaletteEntry } from '../../src/core/types'
import { describeAddedColour } from '../../src/ui/colourWords'

const entry = (number: number, name: string, rgb: [number, number, number]): PaletteEntry => ({
  number,
  name,
  lab: srgbToOklab({ r: rgb[0], g: rgb[1], b: rgb[2] }),
  hex: '',
  locked: false,
})

const yellow = entry(1, 'Yellow', [250, 210, 40])
const blue = entry(2, 'Blue', [40, 90, 200])

describe('describeAddedColour', () => {
  it('calls a close, darker colour a darker shade of its neighbour', () => {
    expect(describeAddedColour(entry(3, 'Colour 3', [210, 170, 20]), [yellow, blue])).toBe(
      'Colour 3: a darker shade of Colour 1 (Yellow)',
    )
  })

  it('calls a close, lighter colour a lighter shade', () => {
    expect(describeAddedColour(entry(3, 'Colour 3', [255, 235, 120]), [yellow, blue])).toBe(
      'Colour 3: a lighter shade of Colour 1 (Yellow)',
    )
  })

  it('calls a close colour of the same lightness a variation', () => {
    const tealish = entry(3, 'Colour 3', [40, 110, 190])
    expect(describeAddedColour(tealish, [yellow, blue])).toBe(
      'Colour 3: a variation of Colour 2 (Blue)',
    )
  })

  it('calls a colour far from all others a new colour', () => {
    expect(describeAddedColour(entry(3, 'Colour 3', [214, 40, 40]), [yellow, blue])).toBe(
      'Colour 3: a new colour',
    )
  })

  it('does not call white a lighter shade of a pale yellow (from a real Rayquaza run)', () => {
    const paleYellow = entry(2, 'Colour 2', [251, 235, 123])
    expect(describeAddedColour(entry(1, 'Colour 1', [254, 254, 254]), [paleYellow])).toBe(
      'Colour 1: a new colour',
    )
  })
})
