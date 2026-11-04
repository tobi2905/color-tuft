import { describe, expect, it } from 'vitest'
import { labelAt } from '../../src/core/labelMap'
import { poleOfInaccessibility } from '../../src/core/labelPoint'
import { NO_LABEL, type Pt } from '../../src/core/types'

/** Distance from p to the nearest edge of the polygon. */
function edgeDistance(p: Pt, poly: Pt[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

/** Even-odd inside test over all rings. */
function inside(p: Pt, rings: Pt[][]): boolean {
  let hit = false
  for (const poly of rings) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]
      const b = poly[j]
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
        hit = !hit
    }
  }
  return hit
}

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
]

describe('poleOfInaccessibility', () => {
  it('puts the number of a square in its centre', () => {
    const p = poleOfInaccessibility([square], 0.5)
    expect(Math.abs(p.x - 50)).toBeLessThanOrEqual(1)
    expect(Math.abs(p.y - 50)).toBeLessThanOrEqual(1)
  })

  it('puts the number of an L-shape inside it, well away from the edges', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 100 },
      { x: 0, y: 100 },
    ]
    const p = poleOfInaccessibility([l], 0.5)
    expect(inside(p, [l])).toBe(true)
    expect(edgeDistance(p, l)).toBeGreaterThan(14) // the arms are 30 wide: best possible is 15
  })

  it('keeps the number of a ring out of its hole', () => {
    const hole = [
      { x: 20, y: 20 },
      { x: 80, y: 20 },
      { x: 80, y: 80 },
      { x: 20, y: 80 },
    ]
    const p = poleOfInaccessibility([square, hole], 0.5)
    expect(inside(p, [square, hole])).toBe(true)
    expect(Math.min(edgeDistance(p, square), edgeDistance(p, hole))).toBeGreaterThan(9) // band is 20 wide
  })

  it('finds the centre of the largest circle inside a triangle (its incentre)', () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 0, y: 30 },
    ]
    // Incentre of a 30-40-50 right triangle: radius 10, at (10, 10).
    const p = poleOfInaccessibility([tri], 0.1)
    expect(Math.hypot(p.x - 10, p.y - 10)).toBeLessThan(0.5)
  })

  it('handles a sliver without failing', () => {
    const sliver = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0.5 },
      { x: 0, y: 0.5 },
    ]
    expect(inside(poleOfInaccessibility([sliver], 0.1), [sliver])).toBe(true)
  })
})

describe('labelAt', () => {
  const map = { width: 3, height: 2, mmPerPx: 2, labels: new Uint8Array([0, 1, 2, 3, 4, 5]) }

  it('gives the label under a point in mm', () => {
    expect(labelAt(map, { x: 0.5, y: 0.5 })).toBe(0)
    expect(labelAt(map, { x: 2.5, y: 0.5 })).toBe(1)
    expect(labelAt(map, { x: 5.9, y: 3.9 })).toBe(5)
  })

  it('gives NO_LABEL outside the map', () => {
    expect(labelAt(map, { x: -0.1, y: 1 })).toBe(NO_LABEL)
    expect(labelAt(map, { x: 6, y: 1 })).toBe(NO_LABEL)
    expect(labelAt(map, { x: 1, y: 4 })).toBe(NO_LABEL)
  })
})
