import type { Pt } from './types'

/**
 * The point deepest inside a shape (furthest from every edge): where its number goes.
 * `rings`: the outer boundary first, then any holes. Unlike the centre of mass, the result is
 * always inside, even for a C shape or a ring.
 *
 * "Polylabel" (Mapbox, 2016): cover the shape's bounding box with square cells; for each,
 * the distance from its centre to the nearest edge tells how good it is, and that distance
 * plus half the cell's diagonal is the best any point in the cell could do. Cells that might
 * beat the best so far by more than precisionMm are split into four, best-looking first,
 * until none can.
 */
export function poleOfInaccessibility(rings: Pt[][], precisionMm: number): Pt {
  const outer = rings[0]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of outer) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const width = maxX - minX
  const height = maxY - minY
  const cellSize = Math.min(width, height)
  if (cellSize === 0) return { x: minX, y: minY }

  const queue = new MaxHeap()
  const makeCell = (x: number, y: number, half: number): Cell => {
    const d = signedDistance({ x, y }, rings)
    return { x, y, half, d, max: d + half * Math.SQRT2 }
  }

  let half = cellSize / 2
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) queue.push(makeCell(x + half, y + half, half))
  }

  // Good first guesses: the centre of mass of the outer ring, and the bounding box centre.
  let best = makeCell(...centroid(outer), 0)
  const boxCentre = makeCell(minX + width / 2, minY + height / 2, 0)
  if (boxCentre.d > best.d) best = boxCentre

  while (queue.size > 0) {
    const cell = queue.pop()!
    if (cell.d > best.d) best = cell
    if (cell.max - best.d <= precisionMm) continue
    half = cell.half / 2
    queue.push(makeCell(cell.x - half, cell.y - half, half))
    queue.push(makeCell(cell.x + half, cell.y - half, half))
    queue.push(makeCell(cell.x - half, cell.y + half, half))
    queue.push(makeCell(cell.x + half, cell.y + half, half))
  }
  return { x: best.x, y: best.y }
}

type Cell = { x: number; y: number; half: number; d: number; max: number }

/** Distance to the nearest edge of any ring: positive inside the shape, negative outside. */
function signedDistance(p: Pt, rings: Pt[][]): number {
  let inside = false
  let minSq = Infinity
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]
      const b = ring[j]
      // Even–odd rule: crossing the boundary toggles inside/outside (holes included).
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside
      }
      minSq = Math.min(minSq, segmentDistanceSq(p, a, b))
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minSq)
}

function segmentDistanceSq(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
  const x = a.x + t * dx - p.x
  const y = a.y + t * dy - p.y
  return x * x + y * y
}

function centroid(ring: Pt[]): [number, number] {
  let area = 0
  let x = 0
  let y = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    const f = a.x * b.y - b.x * a.y
    x += (a.x + b.x) * f
    y += (a.y + b.y) * f
    area += f * 3
  }
  if (area === 0) return [ring[0].x, ring[0].y]
  return [x / area, y / area]
}

/** A small priority queue: the cell with the highest `max` comes out first. */
class MaxHeap {
  private items: Cell[] = []
  get size() {
    return this.items.length
  }
  push(cell: Cell) {
    const a = this.items
    a.push(cell)
    let i = a.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (a[parent].max >= a[i].max) break
      ;[a[parent], a[i]] = [a[i], a[parent]]
      i = parent
    }
  }
  pop(): Cell | undefined {
    const a = this.items
    if (a.length === 0) return undefined
    const top = a[0]
    const last = a.pop()!
    if (a.length > 0) {
      a[0] = last
      let i = 0
      while (true) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].max > a[m].max) m = l
        if (r < a.length && a[r].max > a[m].max) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}
