import { describe, expect, it } from 'vitest'
import { connectedRegions } from '../../../src/core/cleanup/regions'
import { type LabelMap, NO_LABEL } from '../../../src/core/types'
import { FIXTURE, triforce } from '../../fixtures/images'

/** A label map from rows of digits; '.' is NO_LABEL. */
function mapFrom(...rows: string[]): LabelMap {
  const width = rows[0].length
  const labels = new Uint8Array(
    rows
      .join('')
      .split('')
      .map((ch) => (ch === '.' ? NO_LABEL : Number(ch))),
  )
  return { width, height: rows.length, mmPerPx: 1, labels }
}

/** The Triforce as a label map: gold = 0, dark = 1. */
function triforceMap(size: number): LabelMap {
  const img = triforce(size)
  const labels = new Uint8Array(size * size)
  for (let p = 0; p < size * size; p++) labels[p] = img.data[p * 4] === FIXTURE.gold.r ? 0 : 1
  return { width: size, height: size, mmPerPx: 1, labels }
}

describe('connectedRegions', () => {
  it('finds 3 gold triangles and 1 background in the Triforce', () => {
    const { regions } = connectedRegions(triforceMap(200))
    expect(regions.filter((r) => r.label === 0)).toHaveLength(3)
    expect(regions.filter((r) => r.label === 1)).toHaveLength(1)
  })

  it('counts pixels touching only at a corner as separate (4-connected)', () => {
    const { regions } = connectedRegions(mapFrom('01', '10'))
    expect(regions).toHaveLength(4)
  })

  it('joins corner-touching pixels when asked for 8-connectivity', () => {
    const { regions } = connectedRegions(mapFrom('01', '10'), 8)
    expect(regions).toHaveLength(2)
    expect(
      connectedRegions(mapFrom('100', '010', '001'), 8).regions.filter((r) => r.label === 1),
    ).toHaveLength(1)
  })

  it('gives outside pixels (NO_LABEL) no region and id -1', () => {
    const { ids, regions } = connectedRegions(mapFrom('.0.', '.0.', '...'))
    expect(regions).toHaveLength(1)
    expect(regions[0].label).toBe(0)
    expect(Array.from(ids)).toEqual([-1, 0, -1, -1, 0, -1, -1, -1, -1])
  })

  it('reports area and bounding box [minX, minY, maxX, maxY]', () => {
    const { regions } = connectedRegions(mapFrom('1111', '1001', '1001', '1111'))
    const ring = regions.find((r) => r.label === 1)!
    const hole = regions.find((r) => r.label === 0)!
    expect([ring.areaPx, ring.bbox]).toEqual([12, [0, 0, 3, 3]])
    expect([hole.areaPx, hole.bbox]).toEqual([4, [1, 1, 2, 2]])
  })

  it('maps every pixel to a region with its own label, ids matching the list', () => {
    const map = triforceMap(120)
    const { ids, regions } = connectedRegions(map)
    regions.forEach((r, i) => expect(r.id).toBe(i))
    const area = new Array(regions.length).fill(0)
    for (let p = 0; p < map.labels.length; p++) {
      expect(regions[ids[p]].label).toBe(map.labels[p])
      area[ids[p]]++
    }
    expect(area).toEqual(regions.map((r) => r.areaPx))
  })

  it('handles a region of 9 million pixels without running out of stack', () => {
    const size = 3000
    const map = { width: size, height: size, mmPerPx: 1, labels: new Uint8Array(size * size) }
    const { regions } = connectedRegions(map)
    expect(regions).toHaveLength(1)
    expect(regions[0].areaPx).toBe(size * size)
  })

  it('handles a long winding path (the worst case for recursion)', () => {
    // A 1-pixel snake winding through a 500 × 500 map: one region, very long and thin.
    const size = 500
    const labels = new Uint8Array(size * size).fill(1)
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x++) labels[y * size + x] = 0
      const link = (y / 2) % 2 === 0 ? size - 1 : 0
      if (y + 1 < size) labels[(y + 1) * size + link] = 0
    }
    const { regions } = connectedRegions({ width: size, height: size, mmPerPx: 1, labels })
    expect(regions.filter((r) => r.label === 0)).toHaveLength(1)
  })
})
