import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { mergeSmallIslands } from '../../../src/core/cleanup/islands'
import { connectedRegions } from '../../../src/core/cleanup/regions'
import { assignLabels } from '../../../src/core/quantize/assign'
import { type LabelMap, NO_LABEL } from '../../../src/core/types'
import { FIXTURE, sixColours, thinOutline, withJpegNoise } from '../../fixtures/images'

/** A label map from rows of digits; '.' is NO_LABEL. */
function mapFrom(mmPerPx: number, ...rows: string[]): LabelMap {
  const labels = new Uint8Array(
    rows
      .join('')
      .split('')
      .map((ch) => (ch === '.' ? NO_LABEL : Number(ch))),
  )
  return { width: rows[0].length, height: rows.length, mmPerPx, labels }
}

const rowsOf = (map: LabelMap) =>
  Array.from({ length: map.height }, (_, y) =>
    Array.from(map.labels.subarray(y * map.width, (y + 1) * map.width))
      .map((l) => (l === NO_LABEL ? '.' : String(l)))
      .join(''),
  )

describe('mergeSmallIslands', () => {
  it('removes 1-pixel specks', () => {
    const map = mapFrom(1, '00000', '01000', '00020', '00000')
    expect(rowsOf(mergeSmallIslands(map, 2))).toEqual(['00000', '00000', '00000', '00000'])
  })

  it('keeps a region exactly at the threshold, merges one just below', () => {
    const map = mapFrom(1, '0000', '0110', '0110', '0000') // the 1s cover 4 mm²
    expect(rowsOf(mergeSmallIslands(map, 4))).toEqual(rowsOf(map))
    expect(rowsOf(mergeSmallIslands(map, 4.01))).toEqual(['0000', '0000', '0000', '0000'])
  })

  it('measures in mm², not pixels', () => {
    const map = mapFrom(2, '0000', '0110', '0110', '0000') // 4 px at 2 mm/px = 16 mm²
    expect(rowsOf(mergeSmallIslands(map, 16))).toEqual(rowsOf(map))
    expect(rowsOf(mergeSmallIslands(map, 17))).toEqual(['0000', '0000', '0000', '0000'])
  })

  it('gives an island the colour it shares the longest border with', () => {
    // The 2s touch 0 along 5 pixel sides and 1 along 7, so they become 1.
    const map = mapFrom(1, '00001111', '00022211', '00022211', '00022211', '00001111')
    expect(rowsOf(mergeSmallIslands(map, 10))).toEqual([
      '00001111',
      '00011111',
      '00011111',
      '00011111',
      '00001111',
    ])
  })

  it('resolves chains: a speck inside a small ring inside a big area ends as the big area', () => {
    const map = mapFrom(1, '0000000', '0011100', '0012100', '0011100', '0000000')
    expect(new Set(mergeSmallIslands(map, 10).labels)).toEqual(new Set([0]))
  })

  it('fills a tiny see-through hole inside the art with the colour around it', () => {
    const map = mapFrom(1, '00000', '00000', '00.00', '00000', '00000')
    expect(rowsOf(mergeSmallIslands(map, 4))).toEqual(['00000', '00000', '00000', '00000', '00000'])
  })

  it('keeps a see-through hole that is big enough, and outside that touches the edge', () => {
    const big = mapFrom(1, '000000', '0..000', '0..000', '000000')
    expect(rowsOf(mergeSmallIslands(big, 4))).toEqual(rowsOf(big)) // 4 mm² hole, threshold 4
    const edge = mapFrom(1, '.0000', '00000', '00000')
    expect(rowsOf(mergeSmallIslands(edge, 4))).toEqual(rowsOf(edge)) // touches the edge: outside
  })

  it('never merges into the outside, but removes a speck that has nothing else around it', () => {
    const map = mapFrom(1, '..0000', '.10000', '......', '..2...')
    expect(rowsOf(mergeSmallIslands(map, 2))).toEqual(['..0000', '.00000', '......', '......'])
  })

  const palette = [
    FIXTURE.red,
    FIXTURE.green,
    FIXTURE.blue,
    FIXTURE.gold,
    FIXTURE.black,
    FIXTURE.white,
  ]
  const noisyMap = (amplitude: number) =>
    assignLabels(withJpegNoise(sixColours(150), amplitude, 4), palette.map(srgbToOklab), 1)

  it('cleans a speckled image back to its 6 tiles', () => {
    const map = noisyMap(80) // about 9% of pixels get a wrong colour
    expect(connectedRegions(map).regions.length).toBeGreaterThan(1000)
    expect(connectedRegions(mergeSmallIslands(map, 20)).regions).toHaveLength(6)
  })

  it('leaves no region below the threshold, even in extreme noise', () => {
    // A quarter of the pixels wrong: some noise clumps grow past 20 mm² and rightly stay.
    const { regions } = connectedRegions(mergeSmallIslands(noisyMap(110), 20))
    expect(regions.every((r) => r.areaPx >= 20)).toBe(true)
  })

  it('keeps a long thin line: its area is large even though it is 1 px wide', () => {
    const img = thinOutline(200, 1)
    const labels = new Uint8Array(200 * 200)
    for (let p = 0; p < labels.length; p++) {
      labels[p] = img.data[p * 4] === 0 ? 1 : img.data[p * 4 + 1] === 40 ? 2 : 0 // black 1, red 2
    }
    const map = { width: 200, height: 200, mmPerPx: 1, labels }
    const merged = mergeSmallIslands(map, 20)
    // Kept whole (corner steps may be filled in, so it can only grow) and one connected line.
    expect(merged.labels.filter((l) => l === 1).length).toBeGreaterThanOrEqual(
      labels.filter((l) => l === 1).length,
    )
    expect(connectedRegions(merged).regions.filter((r) => r.label === 1)).toHaveLength(1)
  })

  it('does not change the input', () => {
    const map = mapFrom(1, '00000', '01000', '00000')
    const before = Uint8Array.from(map.labels)
    mergeSmallIslands(map, 2)
    expect(map.labels).toEqual(before)
  })
})
