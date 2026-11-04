import { describe, expect, it } from 'vitest'
import { polygonArea, signedArea } from '../../src/core/geometry'

const square = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 2 },
  { x: 0, y: 2 },
]

describe('polygonArea', () => {
  it('measures a 2 × 2 square as 4', () => {
    expect(polygonArea(square)).toBe(4)
  })

  it('gives the same area in either direction', () => {
    expect(polygonArea([...square].reverse())).toBe(4)
  })

  it('measures a triangle (base 4, height 3) as 6', () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 3 },
      ]),
    ).toBe(6)
  })

  it('handles a non-convex L shape', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 3 },
      { x: 0, y: 3 },
    ]
    expect(polygonArea(l)).toBe(5)
  })

  it('is 0 for fewer than 3 points', () => {
    expect(polygonArea([])).toBe(0)
    expect(
      polygonArea([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBe(0)
  })
})

describe('signedArea', () => {
  it('has opposite signs for the two directions', () => {
    expect(signedArea(square)).toBe(-signedArea([...square].reverse()))
    expect(Math.abs(signedArea(square))).toBe(4)
  })
})
