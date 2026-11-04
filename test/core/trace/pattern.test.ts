import { describe, expect, it } from 'vitest'
import { connectedRegions } from '../../../src/core/cleanup/regions'
import { polygonArea, signedArea } from '../../../src/core/geometry'
import { buildPattern, ringToPolygon } from '../../../src/core/trace/pattern'
import {
  type ImageGrid,
  type LabelMap,
  NO_LABEL,
  type RGB,
  type VectorPattern,
} from '../../../src/core/types'
import { FIXTURE, circle, gradientCircle, sixColours, triforce } from '../../fixtures/images'

/** Label map: each distinct colour gets its own label, in order of first appearance. */
function labelsOf(img: ImageGrid, transparent?: RGB): LabelMap {
  const index = new Map<string, number>()
  const labels = new Uint8Array(img.width * img.height)
  for (let p = 0; p < labels.length; p++) {
    const d = img.data
    if (
      transparent &&
      d[p * 4] === transparent.r &&
      d[p * 4 + 1] === transparent.g &&
      d[p * 4 + 2] === transparent.b
    ) {
      labels[p] = NO_LABEL
      continue
    }
    const key = `${d[p * 4]},${d[p * 4 + 1]},${d[p * 4 + 2]}`
    if (!index.has(key)) index.set(key, index.size)
    labels[p] = index.get(key)!
  }
  return { width: img.width, height: img.height, mmPerPx: 1, labels }
}

const rug = (map: LabelMap) => ({
  widthMm: map.width * map.mmPerPx,
  heightMm: map.height * map.mmPerPx,
})

/** A region's area from its rings: outer rings minus holes. */
function regionArea(pattern: VectorPattern, regionIndex: number): number {
  return pattern.regions[regionIndex].rings.reduce(
    (sum, ring) => sum - signedArea(ringToPolygon(pattern, ring, 32)),
    0,
  )
}

const cases: [string, LabelMap][] = [
  ['triforce', labelsOf(triforce(200))],
  ['circle', labelsOf(circle(200))],
  ['sixColours', labelsOf(sixColours(150))],
  ['gradient bands', labelsOf(gradientCircle(240, 6))],
  ['circle on transparent', labelsOf(circle(200), FIXTURE.white)],
]

/** At real rug scale (about 1 mm per pixel, shapes several hundred pixels across). */
const rugScaleCases: [string, LabelMap][] = [
  ['triforce', labelsOf(triforce(500))],
  ['circle', labelsOf(circle(400))],
  ['gradient bands', labelsOf(gradientCircle(600, 6))],
]

/** Total border length of a region (mm), from its rings. */
function regionPerimeter(pattern: VectorPattern, regionIndex: number): number {
  let total = 0
  for (const ring of pattern.regions[regionIndex].rings) {
    const poly = ringToPolygon(pattern, ring, 32)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      total += Math.hypot(b.x - a.x, b.y - a.y)
    }
  }
  return total
}

describe('buildPattern', () => {
  it('finds 3 gold triangles and one background with 3 holes in the Triforce', () => {
    const map = labelsOf(triforce(200)) // dark = 0 (the first pixel), gold = 1
    const pattern = buildPattern(map, rug(map))
    const gold = pattern.regions.filter((r) => r.label === 1)
    const dark = pattern.regions.filter((r) => r.label === 0)
    expect(gold).toHaveLength(3)
    for (const g of gold) expect(g.rings).toHaveLength(1)
    expect(dark).toHaveLength(1)
    expect(dark[0].rings).toHaveLength(4) // outer edge of the rug + 3 triangle holes
  })

  it.each(cases)('moves no border of %s by more than 0.5 mm on average', (_, map) => {
    // Area difference ÷ border length = how far the smoothed border lies from the pixel
    // border on average. Independent of the shape's size.
    const pattern = buildPattern(map, rug(map))
    const { regions } = connectedRegions(map)
    expect(pattern.regions).toHaveLength(regions.length)
    pattern.regions.forEach((region, i) => {
      const pixels = regions[region.id].areaPx * map.mmPerPx ** 2
      expect(region.label).toBe(regions[region.id].label)
      const shift = Math.abs(regionArea(pattern, i) - pixels) / regionPerimeter(pattern, i)
      expect(shift).toBeLessThan(0.5)
    })
  })

  it.each(rugScaleCases)(
    'matches every region of %s at rug scale to its pixel area within 1%%',
    (_, map) => {
      const pattern = buildPattern(map, rug(map))
      const { regions } = connectedRegions(map)
      pattern.regions.forEach((region, i) => {
        const pixels = regions[region.id].areaPx * map.mmPerPx ** 2
        expect(Math.abs(regionArea(pattern, i) - pixels) / pixels).toBeLessThan(0.01)
      })
    },
  )

  it.each(cases)('uses every edge of %s twice, or once where it meets the outside', (_, map) => {
    const pattern = buildPattern(map, rug(map))
    const uses = new Map<number, number>()
    for (const r of pattern.regions) {
      for (const ring of r.rings)
        for (const ref of ring) uses.set(ref.edgeId, (uses.get(ref.edgeId) ?? 0) + 1)
    }
    for (const e of pattern.edges) {
      const outside = e.left === NO_LABEL || e.right === NO_LABEL
      expect(uses.get(e.id)).toBe(outside ? 1 : 2)
    }
  })

  it.each(cases)('closes every ring of %s: each edge ends where the next begins', (_, map) => {
    const pattern = buildPattern(map, rug(map))
    const ends = (ref: { edgeId: number; reversed: boolean }) => {
      const e = pattern.edges[ref.edgeId]
      const last = e.segs.length ? e.segs[e.segs.length - 1].to : e.start
      return ref.reversed ? { from: last, to: e.start } : { from: e.start, to: last }
    }
    for (const r of pattern.regions) {
      for (const ring of r.rings) {
        for (let i = 0; i < ring.length; i++) {
          const a = ends(ring[i]).to
          const b = ends(ring[(i + 1) % ring.length]).from
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-9)
        }
      }
    }
  })

  it('walks outer rings and holes in opposite directions', () => {
    const map = labelsOf(triforce(200))
    const pattern = buildPattern(map, rug(map))
    const background = pattern.regions.find((r) => r.rings.length > 1)!
    const signs = background.rings.map((ring) =>
      Math.sign(signedArea(ringToPolygon(pattern, ring, 8))),
    )
    expect(signs.filter((s) => s === signs[0])).toHaveLength(1) // one outer, the rest holes
  })

  it('keeps the rug size', () => {
    const map = labelsOf(triforce(100))
    expect(buildPattern(map, { widthMm: 100, heightMm: 100 }).rug).toEqual({
      widthMm: 100,
      heightMm: 100,
    })
  })
})

describe('ringToPolygon', () => {
  it('turns a square region into its 4 corners', () => {
    const labels = new Uint8Array(30 * 30)
    for (let y = 10; y < 20; y++) for (let x = 5; x < 25; x++) labels[y * 30 + x] = 1
    const map = { width: 30, height: 30, mmPerPx: 2, labels }
    const pattern = buildPattern(map, rug(map))
    const square = pattern.regions.find((r) => r.label === 1)!
    const poly = ringToPolygon(pattern, square.rings[0], 8)
    expect(poly).toHaveLength(4)
    expect(polygonArea(poly)).toBe(20 * 10 * 4) // 20 × 10 pixels of 2 mm
  })
})
