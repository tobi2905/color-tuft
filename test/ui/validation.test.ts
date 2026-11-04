import { describe, expect, it } from 'vitest'
import { parseCm, rugSizeErrors } from '../../src/ui/validation'

describe('parseCm', () => {
  it.each([
    ['120', 120],
    ['120.5', 120.5],
    ['120,5', 120.5],
    [' 80 ', 80],
  ])('reads %j as %d', (text, value) => {
    expect(parseCm(text)).toBe(value)
  })

  it.each(['', 'abc', '12cm', '1.2.3', '--3'])('rejects %j', (text) => {
    expect(parseCm(text)).toBeNull()
  })
})

describe('rugSizeErrors', () => {
  it('accepts sizes from just above 0 to 500 cm', () => {
    expect(rugSizeErrors('120', '80')).toEqual({ width: null, height: null })
    expect(rugSizeErrors('500', '0.5')).toEqual({ width: null, height: null })
  })

  it('explains each problem in plain words, per field', () => {
    expect(rugSizeErrors('', '80').width).toBe('Enter the width in cm.')
    expect(rugSizeErrors('abc', '80').width).toBe('Enter the width as a number of cm, e.g. 120.')
    expect(rugSizeErrors('0', '80').width).toBe('The width must be more than 0 cm.')
    expect(rugSizeErrors('-20', '80').width).toBe('The width must be more than 0 cm.')
    expect(rugSizeErrors('120', '501').height).toBe('The height can be at most 500 cm.')
    expect(rugSizeErrors('120', '501').width).toBeNull()
  })
})
