import { connectedRegions } from '../cleanup/regions'
import type { Edge, LabelMap, PathSeg, Pt, Region, RingRef, RugSize, VectorPattern } from '../types'
import { traceBorders } from './borders'
import { DEFAULT_WINDOW_POINTS, samePoint } from './corners'
import { DEFAULT_CORNER_ANGLE_DEG, DEFAULT_TOLERANCE_MM, fitEdge } from './fit'

/**
 * The colour map as a vector pattern: smooth shared borders and the areas they enclose.
 *
 * 1. Trace every border once (traceBorders) and fit it once (fitEdge). `sourcePxMm`: how big
 *    one pixel of the original image is on the rug; enlarged images get a longer corner
 *    window and a looser tolerance, so their bigger pixel steps don't read as corners.
 * 2. Areas are the 4-connected patches of the map (connectedRegions); the outside is none.
 * 3. Each area gets its rings: the outer boundary and one ring per hole. A ring is a list of
 *    edges, each walked forwards or backwards so the area is always on the left. Two
 *    neighbouring areas use the same edge in opposite directions: no gaps, no overlaps.
 *    Walking with the area on the left makes outer rings and holes go round in opposite
 *    directions.
 */
export function buildPattern(
  map: LabelMap,
  rug: RugSize,
  opts: { sourcePxMm?: number } = {},
): VectorPattern {
  const traced = traceBorders(map).edges
  const { ids, regions: infos } = connectedRegions(map)
  // An image enlarged onto the rug has staircases of steps one source pixel long: the corner
  // window and the tolerance scale with that, never below the defaults.
  const stepPx = Math.max(1, (opts.sourcePxMm ?? 0) / map.mmPerPx)
  const fitOpts = {
    toleranceMm: Math.max(DEFAULT_TOLERANCE_MM, stepPx * map.mmPerPx), // one source pixel
    cornerAngleDeg: DEFAULT_CORNER_ANGLE_DEG,
    windowPoints: Math.round(DEFAULT_WINDOW_POINTS * stepPx),
  }

  const edges: Edge[] = traced.map((t, id) => ({
    id,
    left: t.left,
    right: t.right,
    ...fitEdge(t.points, fitOpts),
  }))

  // Which area lies on each side of each edge: look at the pixels beside its first step.
  const regionAt = (xMm: number, yMm: number) => {
    const x = Math.floor(xMm / map.mmPerPx)
    const y = Math.floor(yMm / map.mmPerPx)
    return x < 0 || y < 0 || x >= map.width || y >= map.height ? -1 : ids[y * map.width + x]
  }
  const sides = traced.map((t) => {
    const [a, b] = t.points
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    // Left of the step (dx, dy) is (dy, −dx) (y points down); a quarter step off the crack.
    const dx = (b.x - a.x) / 4
    const dy = (b.y - a.y) / 4
    return { left: regionAt(mid.x + dy, mid.y - dx), right: regionAt(mid.x - dy, mid.y + dx) }
  })

  // For every area: the edges around it, each walked so the area is on its left.
  type Walk = { ref: { edgeId: number; reversed: boolean }; from: Pt; to: Pt; closed: boolean }
  const walks: Walk[][] = infos.map(() => [])
  traced.forEach((t, edgeId) => {
    const first = t.points[0]
    const last = t.points[t.points.length - 1]
    const closed = samePoint(first, last)
    if (sides[edgeId].left !== -1) {
      walks[sides[edgeId].left].push({
        ref: { edgeId, reversed: false },
        from: first,
        to: last,
        closed,
      })
    }
    if (sides[edgeId].right !== -1) {
      walks[sides[edgeId].right].push({
        ref: { edgeId, reversed: true },
        from: last,
        to: first,
        closed,
      })
    }
  })

  const regions: Region[] = infos.map((info) => {
    const rings: RingRef[] = []
    const mine = walks[info.id]
    const used = new Set<Walk>()
    const key = (p: Pt) => `${p.x},${p.y}`
    const startingAt = new Map<string, Walk[]>()
    for (const w of mine) {
      if (w.closed) {
        rings.push([w.ref]) // a loop without nodes is a ring by itself
        used.add(w)
      } else {
        startingAt.set(key(w.from), [...(startingAt.get(key(w.from)) ?? []), w])
      }
    }
    // Chain open edges node to node until the ring closes.
    for (const w of mine) {
      if (used.has(w)) continue
      const ring: RingRef = []
      let current = w
      while (!used.has(current)) {
        used.add(current)
        ring.push(current.ref)
        const next = (startingAt.get(key(current.to)) ?? []).find((n) => !used.has(n))
        if (!next) break
        current = next
      }
      rings.push(ring)
    }
    return { id: info.id, label: info.label, rings }
  })

  return { rug, edges, regions }
}

/**
 * A ring as a closed list of points (mm): lines by their ends, each curve by stepsPerCurve
 * points. Edges walked backwards are reversed. The first point is not repeated at the end.
 */
export function ringToPolygon(pattern: VectorPattern, ring: RingRef, stepsPerCurve: number): Pt[] {
  const out: Pt[] = []
  for (const ref of ring) {
    const edge = pattern.edges[ref.edgeId]
    let pts = samplePath(edge.start, edge.segs, stepsPerCurve)
    if (ref.reversed) pts = pts.reverse()
    // Each edge starts where the previous one ended: skip the repeated point.
    if (out.length > 0 && samePoint(out[out.length - 1], pts[0])) pts = pts.slice(1)
    out.push(...pts)
  }
  if (out.length > 1 && samePoint(out[0], out[out.length - 1])) out.pop()
  return out
}

/** The points along a path: its start, line ends, and stepsPerCurve points per curve. */
function samplePath(start: Pt, segs: PathSeg[], stepsPerCurve: number): Pt[] {
  const pts = [start]
  let from = start
  for (const s of segs) {
    if (s.kind === 'line') pts.push(s.to)
    else {
      for (let i = 1; i <= stepsPerCurve; i++) {
        const t = i / stepsPerCurve
        const u = 1 - t
        pts.push({
          x:
            u * u * u * from.x +
            3 * u * u * t * s.c1.x +
            3 * u * t * t * s.c2.x +
            t * t * t * s.to.x,
          y:
            u * u * u * from.y +
            3 * u * u * t * s.c1.y +
            3 * u * t * t * s.c2.y +
            t * t * t * s.to.y,
        })
      }
      // The last sample is the curve's end; make it exact so edges join without a hair gap.
      pts[pts.length - 1] = s.to
    }
    from = s.to
  }
  return pts
}
