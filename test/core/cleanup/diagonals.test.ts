import { describe, expect, it } from 'vitest'
import { bridgeDiagonals } from '../../../src/core/cleanup/diagonals'
import { connectedRegions } from '../../../src/core/cleanup/regions'
import { type LabelMap, NO_LABEL } from '../../../src/core/types'

function mapFrom(...rows: string[]): LabelMap {
  const labels = new Uint8Array(
    rows
      .join('')
      .split('')
      .map((ch) => (ch === '.' ? NO_LABEL : Number(ch))),
  )
  return { width: rows[0].length, height: rows.length, mmPerPx: 1, labels }
}

const rowsOf = (map: LabelMap) =>
  Array.from({ length: map.height }, (_, y) =>
    Array.from(map.labels.subarray(y * map.width, (y + 1) * map.width))
      .map((l) => (l === NO_LABEL ? '.' : String(l)))
      .join(''),
  )

describe('bridgeDiagonals', () => {
  it('connects a 1-pixel diagonal line through its sides', () => {
    const map = mapFrom('100000', '010000', '001000', '000100', '000010', '000001')
    const bridged = bridgeDiagonals(map)
    expect(connectedRegions(bridged).regions.filter((r) => r.label === 1)).toHaveLength(1)
  })

  it('connects the thinner colour where two colours cross at a corner', () => {
    // A thin diagonal line of 1s across a big area of 0s: the 1s get connected, the 0s
    // (connected around the line anyway) give up a pixel.
    const bridged = bridgeDiagonals(mapFrom('0000', '0100', '0010', '0000'))
    expect(connectedRegions(bridged).regions.filter((r) => r.label === 1)).toHaveLength(1)
    expect(bridged.labels.filter((l) => l === 1)).toHaveLength(3)
  })

  it('leaves maps without corner-only contacts unchanged', () => {
    const map = mapFrom('0011', '0011', '2222')
    expect(rowsOf(bridgeDiagonals(map))).toEqual(rowsOf(map))
  })

  it('never turns a coloured pixel into the outside', () => {
    const bridged = bridgeDiagonals(mapFrom('1.', '.1'))
    expect(bridged.labels.filter((l) => l === NO_LABEL).length).toBeLessThanOrEqual(1)
    expect(connectedRegions(bridged).regions).toHaveLength(1)
  })

  it('does not change the input', () => {
    const map = mapFrom('10', '01')
    const before = Uint8Array.from(map.labels)
    bridgeDiagonals(map)
    expect(map.labels).toEqual(before)
  })
})
