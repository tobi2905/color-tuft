import type { PathSeg, Pt } from '../types'
import { findCorners, samePoint } from './corners'

export const DEFAULT_TOLERANCE_MM = 1.0
export const DEFAULT_CORNER_ANGLE_DEG = 60

/** Directions at the ends of a piece are measured over this many points, so pixel steps average out. */
const TANGENT_WINDOW = 4
/** How often the curve's parameters are refined before splitting (Schneider: a few rounds). */
const REFINE_ROUNDS = 4

/**
 * Turns a traced edge (pixel-corner points, mm) into straight lines and smooth curves.
 *
 * 1. Real corners (findCorners) and the edge's ends split it into pieces. A closed loop is
 *    started at a corner, so no side gets cut in two where the loop happens to begin.
 *    Each piece is fitted through the midpoints of its pixel sides (see sideMidpoints).
 * 2. A piece within toleranceMm of the straight line between its ends becomes one line.
 * 3. Otherwise cubic Béziers are fitted (Schneider, Graphics Gems 1990): least-squares control
 *    points for the given end directions; if still too far off, the curve's parameters are
 *    refined, and if that isn't enough the piece is split at its worst point and both halves
 *    are fitted with the same direction at the split, so they join without a kink.
 *
 * The ends of an open edge stay exactly where they are: they are nodes shared with other borders.
 */
export function fitEdge(
  points: Pt[],
  opts: { toleranceMm: number; cornerAngleDeg: number },
): { start: Pt; segs: PathSeg[] } {
  if (points.length < 2) return { start: points[0], segs: [] }
  const tol = opts.toleranceMm
  const closed = points.length > 3 && samePoint(points[0], points[points.length - 1])
  const corners = findCorners(points, opts)

  if (!closed) {
    const breaks = [0, ...corners, points.length - 1]
    const segs: PathSeg[] = []
    for (let k = 0; k + 1 < breaks.length; k++) {
      segs.push(...fitPiece(sideMidpoints(points.slice(breaks[k], breaks[k + 1] + 1)), tol))
    }
    return { start: points[0], segs }
  }

  const ring = points.slice(0, -1)
  const n = ring.length
  if (corners.length === 0) {
    // A smooth loop: start anywhere (here: the first side's midpoint), with the same
    // direction leaving and arriving there.
    const mids = ring.map((p, i) => midpoint(p, ring[(i + 1) % n]))
    const t = direction(mids[n - TANGENT_WINDOW], mids[TANGENT_WINDOW])
    return { start: mids[0], segs: fitCurves([...mids, mids[0]], t, negate(t), tol) }
  }
  // Rotate the ring to start at the first corner; then pieces run from corner to corner.
  const shift = corners[0]
  const rotated = [...ring.slice(shift), ...ring.slice(0, shift), ring[shift]]
  const breaks = [...corners.map((c) => c - shift), n]
  const segs: PathSeg[] = []
  for (let k = 0; k + 1 < breaks.length; k++) {
    segs.push(...fitPiece(sideMidpoints(rotated.slice(breaks[k], breaks[k + 1] + 1)), tol))
  }
  return { start: ring[shift], segs }
}

/**
 * The points a piece is fitted through: its two ends exactly (corners or nodes), and in
 * between the midpoints of the pixel sides instead of the pixel corners. The corners of a
 * pixel staircase stick out up to ~1.1 px from the true line; the midpoints lie on it for a
 * 45° staircase and within about half a pixel for any other slope.
 */
function sideMidpoints(pts: Pt[]): Pt[] {
  if (pts.length <= 2) return pts
  const out = [pts[0]]
  for (let i = 0; i + 1 < pts.length; i++) out.push(midpoint(pts[i], pts[i + 1]))
  out.push(pts[pts.length - 1])
  return out
}

/** One piece between corners: a single line if close enough, otherwise curves. */
function fitPiece(pts: Pt[], tol: number): PathSeg[] {
  const end = pts[pts.length - 1]
  if (pts.length <= 2 || maxDistanceToChord(pts) <= tol) return [{ kind: 'line', to: end }]
  const k = Math.min(TANGENT_WINDOW, pts.length - 1)
  const tStart = direction(pts[0], pts[k])
  const tEnd = direction(end, pts[pts.length - 1 - k]) // pointing back into the piece
  return fitCurves(pts, tStart, tEnd, tol)
}

/**
 * Schneider's fit of points d[0..n-1] with cubic Béziers. tStart: unit direction leaving
 * d[0]; tEnd: unit direction from d[n-1] back into the curve.
 */
function fitCurves(d: Pt[], tStart: Pt, tEnd: Pt, tol: number): PathSeg[] {
  const first = d[0]
  const last = d[d.length - 1]
  if (d.length === 2) {
    const dist = Math.hypot(last.x - first.x, last.y - first.y) / 3
    return [
      {
        kind: 'cubic',
        c1: add(first, scale(tStart, dist)),
        c2: add(last, scale(tEnd, dist)),
        to: last,
      },
    ]
  }

  let u = chordLengthParameters(d)
  let curve = generateBezier(d, u, tStart, tEnd)
  let { maxError, worst } = computeMaxError(d, curve, u)
  if (maxError <= tol) return [curve.seg]

  // Close, but not close enough: refine where on the curve each point belongs, then retry.
  if (maxError <= 4 * tol) {
    for (let round = 0; round < REFINE_ROUNDS; round++) {
      u = reparameterize(d, u, curve)
      curve = generateBezier(d, u, tStart, tEnd)
      ;({ maxError, worst } = computeMaxError(d, curve, u))
      if (maxError <= tol) return [curve.seg]
    }
  }

  // Split at the worst point. Both halves share the direction there: no kink at the join.
  const split = Math.min(d.length - 2, Math.max(1, worst))
  const k = Math.min(TANGENT_WINDOW, split, d.length - 1 - split)
  const tMid = direction(d[split - k], d[split + k])
  return [
    ...fitCurves(d.slice(0, split + 1), tStart, negate(tMid), tol),
    ...fitCurves(d.slice(split), tMid, tEnd, tol),
  ]
}

type Curve = { p0: Pt; seg: Extract<PathSeg, { kind: 'cubic' }> }

/** Least-squares control points for fixed end directions (Schneider's generateBezier). */
function generateBezier(d: Pt[], u: number[], tStart: Pt, tEnd: Pt): Curve {
  const first = d[0]
  const last = d[d.length - 1]
  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  for (let i = 0; i < d.length; i++) {
    const t = u[i]
    const a0 = scale(tStart, b1(t))
    const a1 = scale(tEnd, b2(t))
    c00 += dot(a0, a0)
    c01 += dot(a0, a1)
    c11 += dot(a1, a1)
    // Where the point is, minus where the curve would be with both control points at the ends.
    const base = add(scale(first, b0(t) + b1(t)), scale(last, b2(t) + b3(t)))
    const rest = sub(d[i], base)
    x0 += dot(a0, rest)
    x1 += dot(a1, rest)
  }
  const det = c00 * c11 - c01 * c01
  const segLength = Math.hypot(last.x - first.x, last.y - first.y)
  let alphaStart = det === 0 ? 0 : (x0 * c11 - x1 * c01) / det
  let alphaEnd = det === 0 ? 0 : (c00 * x1 - c01 * x0) / det
  // Degenerate or backwards solutions: fall back to a third of the distance (Schneider's rule).
  const eps = 1e-6 * segLength
  if (alphaStart < eps || alphaEnd < eps) alphaStart = alphaEnd = segLength / 3

  return {
    p0: first,
    seg: {
      kind: 'cubic',
      c1: add(first, scale(tStart, alphaStart)),
      c2: add(last, scale(tEnd, alphaEnd)),
      to: last,
    },
  }
}

/** Largest distance between a point and the curve at that point's parameter, and where. */
function computeMaxError(d: Pt[], curve: Curve, u: number[]): { maxError: number; worst: number } {
  let maxError = 0
  let worst = Math.floor(d.length / 2)
  for (let i = 1; i < d.length - 1; i++) {
    const p = bezierAt(curve, u[i])
    const e = Math.hypot(p.x - d[i].x, p.y - d[i].y)
    if (e > maxError) {
      maxError = e
      worst = i
    }
  }
  return { maxError, worst }
}

/** Parameters 0..1 in proportion to the distance along the points. */
function chordLengthParameters(d: Pt[]): number[] {
  const u = [0]
  for (let i = 1; i < d.length; i++) {
    u.push(u[i - 1] + Math.hypot(d[i].x - d[i - 1].x, d[i].y - d[i - 1].y))
  }
  const total = u[u.length - 1]
  return u.map((v) => (total === 0 ? 0 : v / total))
}

/** One Newton–Raphson step per point: move its parameter to where the curve is nearest. */
function reparameterize(d: Pt[], u: number[], curve: Curve): number[] {
  const { p0 } = curve
  const { c1, c2, to: p3 } = curve.seg
  // First and second derivative control points.
  const q1 = [scale(sub(c1, p0), 3), scale(sub(c2, c1), 3), scale(sub(p3, c2), 3)]
  const q2 = [scale(sub(q1[1], q1[0]), 2), scale(sub(q1[2], q1[1]), 2)]
  return u.map((t, i) => {
    const p = bezierAt(curve, t)
    const d1 = quadAt(q1, t)
    const d2 = lineAt(q2, t)
    const diff = sub(p, d[i])
    const numerator = dot(diff, d1)
    const denominator = dot(d1, d1) + dot(diff, d2)
    if (denominator === 0) return t
    return Math.min(1, Math.max(0, t - numerator / denominator))
  })
}

function bezierAt(curve: Curve, t: number): Pt {
  const { p0 } = curve
  const { c1, c2, to } = curve.seg
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
  }
}

function quadAt(q: Pt[], t: number): Pt {
  const u = 1 - t
  return {
    x: u * u * q[0].x + 2 * u * t * q[1].x + t * t * q[2].x,
    y: u * u * q[0].y + 2 * u * t * q[1].y + t * t * q[2].y,
  }
}

function lineAt(q: Pt[], t: number): Pt {
  return { x: (1 - t) * q[0].x + t * q[1].x, y: (1 - t) * q[0].y + t * q[1].y }
}

/** Largest distance from the points to the straight line between the first and last. */
function maxDistanceToChord(pts: Pt[]): number {
  const a = pts[0]
  const b = pts[pts.length - 1]
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  let max = 0
  for (const p of pts) {
    const dist =
      len === 0
        ? Math.hypot(p.x - a.x, p.y - a.y)
        : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len
    max = Math.max(max, dist)
  }
  return max
}

// Bernstein basis functions of a cubic Bézier.
const b0 = (t: number) => (1 - t) ** 3
const b1 = (t: number) => 3 * t * (1 - t) ** 2
const b2 = (t: number) => 3 * t * t * (1 - t)
const b3 = (t: number) => t ** 3

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s })
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y
const negate = (a: Pt): Pt => ({ x: -a.x, y: -a.y })
const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Unit vector from a to b. */
function direction(a: Pt, b: Pt): Pt {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  return len === 0 ? { x: 1, y: 0 } : { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
}
