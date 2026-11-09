import { describe, expect, it } from 'vitest'
import type { Yarn } from '../../src/core/types'
import { createYarnStore } from '../../src/ui/store/yarnStore'
import {
  type SwatchRow,
  autoNumber,
  swatchImportErrors,
  swatchSampleRadius,
  swatchesToYarns,
} from '../../src/ui/yarn/swatchRows'

const row = (n: number, change: Partial<SwatchRow> = {}): SwatchRow => ({
  id: n,
  at: { x: n * 10, y: 5 },
  hex: '#D62828',
  name: `Colour ${n}`,
  number: String(n),
  ...change,
})
const fine = (errors: ReturnType<typeof swatchImportErrors>) =>
  errors.shop === null && errors.rows.every((r) => r.name === null && r.number === null)

describe('swatch import', () => {
  it('importing 5 swatches creates 5 catalogue yarns with distinct numbers', () => {
    const rows = [1, 2, 3, 4, 5].map((n) => row(n))
    expect(fine(swatchImportErrors(rows, ' Tuft shop ', []))).toBe(true)
    const store = createYarnStore()
    for (const yarn of swatchesToYarns(rows, ' Tuft shop ')) store.getState().addYarn(yarn)
    const yarns = store.getState().yarns
    expect(yarns).toHaveLength(5)
    expect(yarns.every((y) => y.list === 'catalogue' && y.shop === 'Tuft shop')).toBe(true)
    expect(new Set(yarns.map((y) => y.number)).size).toBe(5)
  })

  it('needs a shop name', () => {
    expect(swatchImportErrors([row(1)], '  ', []).shop).not.toBeNull()
  })

  it('needs a name for every swatch', () => {
    const errors = swatchImportErrors([row(1), row(2, { name: ' ' })], 'Shop', [])
    expect(errors.rows.map((r) => r.name !== null)).toEqual([false, true])
  })

  it('flags a number used twice in the import', () => {
    const errors = swatchImportErrors([row(1), row(2, { number: ' 1 ' }), row(3)], 'Shop', [])
    expect(errors.rows.map((r) => r.number !== null)).toEqual([true, true, false])
  })

  it("flags a number the catalogue already has for this shop, but not another shop's", () => {
    const existing: Yarn[] = [
      { id: 'a', list: 'catalogue', name: 'Old', number: '2', hex: '#000000', shop: 'Shop' },
      { id: 'b', list: 'catalogue', name: 'Other', number: '3', hex: '#000000', shop: 'Elsewhere' },
    ]
    const errors = swatchImportErrors([row(1), row(2), row(3)], 'shop', existing)
    expect(errors.rows.map((r) => r.number !== null)).toEqual([false, true, false])
  })

  it('allows several swatches without a number', () => {
    const errors = swatchImportErrors([row(1, { number: '' }), row(2, { number: '' })], 'S', [])
    expect(fine(errors)).toBe(true)
  })

  it('turns rows into catalogue yarns with trimmed text', () => {
    expect(swatchesToYarns([row(7, { name: ' Ocean ', number: ' 40 ' })], 'Shop')).toEqual([
      { list: 'catalogue', name: 'Ocean', number: '40', hex: '#D62828', shop: 'Shop' },
    ])
  })

  it('samples a small patch: swatches on a chart are small and flat', () => {
    expect(swatchSampleRadius({ width: 2000, height: 1200 })).toBe(6)
    expect(swatchSampleRadius({ width: 300, height: 200 })).toBe(2)
  })

  it('numbers the swatches without a number, skipping numbers already used', () => {
    const existing: Yarn[] = [
      { id: 'a', list: 'catalogue', name: 'Old', number: '1', hex: '#000000', shop: 'Shop' },
    ]
    const rows = [
      row(1, { number: '' }),
      row(2, { number: '3' }),
      row(3, { number: '' }),
      row(4, { number: '' }),
    ]
    expect(autoNumber(rows, 'shop', existing).map((r) => r.number)).toEqual(['2', '3', '4', '5'])
    expect(fine(swatchImportErrors(autoNumber(rows, 'Shop', existing), 'Shop', existing))).toBe(
      true,
    )
  })

  it('leaves rows that already have a number alone', () => {
    const rows = [row(1, { number: 'A-7' })]
    expect(autoNumber(rows, 'Shop', [])).toEqual(rows)
  })
})
