import { describe, expect, it } from 'vitest'
import { type TracedEdge, traceBorders } from '../../../src/core/trace/borders'
import { type LabelMap, NO_LABEL } from '../../../src/core/types'
import { FIXTURE, triforce } from '../../fixtures/images'

function mapFrom(mmPerPx: number, ...rows: string[]): LabelMap {
  const labels = new Uint8Array(
    rows
      .join('')
      .split('')
      .map((ch) => (ch === '.' ? NO_LABEL : Number(ch))),
  )
  return { width: rows[0].length, height: rows.length, mmPerPx, labels }
}

function triforceMap(size: number): LabelMap {
  const img = triforce(size)
  const labels = new Uint8Array(size * size)
  for (let p = 0; p < size * size; p++) labels[p] = img.data[p * 4] === FIXTURE.gold.r ? 0 : 1
  return { width: size, height: size, mmPerPx: 1, labels }
}

/** Label of the pixel at a point (mm), NO_LABEL outside the map. */
function labelAt(map: LabelMap, x: number, y: number): number {
  const px = Math.floor(x / map.mmPerPx)
  const py = Math.floor(y / map.mmPerPx)
  if (px < 0 || py < 0 || px >= map.width || py >= map.height) return NO_LABEL
  return map.labels[py * map.width + px]
}

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`
const isClosed = (e: TracedEdge) => key(e.points[0]) === key(e.points[e.points.length - 1])

describe('traceBorders', () => {
  it('splits a map in half with one straight edge between the two colours', () => {
    const map = mapFrom(1, '000111', '000111', '000111', '000111')
    const inner = traceBorders(map).edges.filter((e) => e.left !== NO_LABEL && e.right !== NO_LABEL)
    expect(inner).toHaveLength(1)
    expect(inner[0].points.every((p) => p.x === 3)).toBe(true)
    expect(new Set([inner[0].left, inner[0].right])).toEqual(new Set([0, 1]))
    const ys = inner[0].points.map((p) => p.y).sort((a, b) => a - b)
    expect([ys[0], ys[ys.length - 1]]).toEqual([0, 4])
  })

  it('puts nodes where three colours meet (the outside counts)', () => {
    const { nodes } = traceBorders(mapFrom(1, '000111', '000111'))
    expect(nodes.map(key).sort()).toEqual(['3,0', '3,2'])
  })

  it('gives points in mm', () => {
    const inner = traceBorders(mapFrom(2.5, '01', '01')).edges.filter(
      (e) => e.left !== NO_LABEL && e.right !== NO_LABEL,
    )
    expect(inner[0].points.map(key).sort()).toEqual(['2.5,0', '2.5,2.5', '2.5,5'])
  })

  it('traces an island as one closed loop with no nodes', () => {
    const { nodes, edges } = traceBorders(mapFrom(1, '00000', '01110', '01110', '00000'))
    const island = edges.filter((e) => e.left === 1 || e.right === 1)
    expect(island).toHaveLength(1)
    expect(isClosed(island[0])).toBe(true)
    expect(island[0].points).toHaveLength(10 + 1) // every pixel corner round a 3 × 2 block, back to start
    expect(nodes).toEqual([])
  })

  it('puts the right colour on each side', () => {
    const map = triforceMap(120)
    for (const e of traceBorders(map).edges) {
      for (let i = 0; i + 1 < e.points.length; i++) {
        const a = e.points[i]
        const b = e.points[i + 1]
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const dx = b.x - a.x
        const dy = b.y - a.y
        // Left of the walking direction (y points down): (dy, -dx); a quarter pixel off the crack.
        expect(labelAt(map, mid.x + dy / 4, mid.y - dx / 4)).toBe(e.left)
        expect(labelAt(map, mid.x - dy / 4, mid.y + dx / 4)).toBe(e.right)
      }
    }
  })

  it('uses every crack between different colours exactly once', () => {
    const map = triforceMap(120)
    const { edges } = traceBorders(map)
    const seen = new Set<string>()
    for (const e of edges) {
      for (let i = 0; i + 1 < e.points.length; i++) {
        const a = key(e.points[i])
        const b = key(e.points[i + 1])
        const segment = a < b ? `${a}|${b}` : `${b}|${a}`
        expect(seen.has(segment)).toBe(false)
        seen.add(segment)
      }
    }
    // Count the cracks directly, treating outside the map as NO_LABEL.
    const at = (x: number, y: number) =>
      x < 0 || y < 0 || x >= map.width || y >= map.height ? NO_LABEL : map.labels[y * map.width + x]
    let cracks = 0
    for (let y = -1; y < map.height; y++) {
      for (let x = -1; x < map.width; x++) {
        if (at(x, y) !== at(x + 1, y) && y >= 0) cracks++
        if (at(x, y) !== at(x, y + 1) && x >= 0) cracks++
      }
    }
    expect(seen.size).toBe(cracks)
  })

  it('closes into rings around every colour: each corner is used an even number of times', () => {
    const map = triforceMap(120)
    const { edges } = traceBorders(map)
    for (const label of [0, 1, NO_LABEL]) {
      const ends = new Map<string, number>()
      for (const e of edges.filter((e) => e.left === label || e.right === label)) {
        for (const p of [e.points[0], e.points[e.points.length - 1]]) {
          ends.set(key(p), (ends.get(key(p)) ?? 0) + 1)
        }
      }
      for (const count of ends.values()) expect(count % 2).toBe(0)
    }
  })

  it('starts and ends every open edge at a node', () => {
    const { nodes, edges } = traceBorders(triforceMap(120))
    const nodeKeys = new Set(nodes.map(key))
    for (const e of edges.filter((e) => !isClosed(e))) {
      expect(nodeKeys.has(key(e.points[0]))).toBe(true)
      expect(nodeKeys.has(key(e.points[e.points.length - 1]))).toBe(true)
    }
  })

  it('makes the middle of a corner-only checker a node', () => {
    const { nodes } = traceBorders(mapFrom(1, '01', '10'))
    expect(nodes.map(key)).toContain('1,1')
  })
})
