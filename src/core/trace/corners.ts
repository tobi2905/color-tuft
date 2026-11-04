import type { Pt } from '../types'

/**
 * How many points back and ahead the direction is measured, by default. Traced edges have a
 * point at every pixel corner, so this is 3 pixel steps: enough for the steps of any pixel
 * staircase to average out (they turn at most ~37° over 3 steps), short enough for small
 * shapes. An image enlarged k× has steps k pixels long and needs a window k× as long.
 */
export const DEFAULT_WINDOW_POINTS = 3

/**
 * Indices of the real corners of a traced edge. At every point, the direction coming in
 * (from `windowPoints` back) is compared with the direction going out (to `windowPoints`
 * ahead). A turn of at least cornerAngleDeg makes the point a candidate; of each run of
 * neighbouring candidates only the sharpest is a corner.
 *
 * A closed edge (first point = last point) is treated as a ring, so a corner can sit where
 * the loop starts; its indices refer to the points without the repeated last one. On an
 * open edge, points closer than the window to an end are never corners (its ends are kept
 * anyway).
 */
export function findCorners(
  points: Pt[],
  opts: { cornerAngleDeg: number; windowPoints?: number },
): number[] {
  const WINDOW = opts.windowPoints ?? DEFAULT_WINDOW_POINTS
  const closed = points.length > 3 && samePoint(points[0], points[points.length - 1])
  const n = closed ? points.length - 1 : points.length
  if (n < 2 * WINDOW + 1) return []
  const at = (i: number) => points[((i % n) + n) % n]

  const turn = new Float64Array(n) // degrees, 0 where not measured
  const first = closed ? 0 : WINDOW
  const last = closed ? n - 1 : n - 1 - WINDOW
  for (let i = first; i <= last; i++) {
    const a = { x: at(i).x - at(i - WINDOW).x, y: at(i).y - at(i - WINDOW).y }
    const b = { x: at(i + WINDOW).x - at(i).x, y: at(i + WINDOW).y - at(i).y }
    turn[i] = angleBetween(a, b)
  }

  const isCandidate = (i: number) => turn[((i % n) + n) % n] >= opts.cornerAngleDeg
  const corners: number[] = []
  if (closed) {
    // Start scanning just after a non-candidate, so no run is cut in two by the loop's start.
    const begin = Array.from({ length: n }, (_, i) => i).find((i) => !isCandidate(i))
    if (begin === undefined) return [] // turning everywhere: no single corner stands out
    for (let k = 1; k <= n; k++) {
      const i = (begin + k) % n
      if (!isCandidate(i) || isCandidate(i - 1)) continue
      corners.push(sharpestInRun(i, isCandidate, turn, n))
    }
  } else {
    for (let i = first; i <= last; i++) {
      if (!isCandidate(i) || (i > first && isCandidate(i - 1))) continue
      corners.push(sharpestInRun(i, (j) => j <= last && isCandidate(j), turn, n))
    }
  }
  return corners.sort((a, b) => a - b)
}

/** The index with the biggest turn in the run of candidates starting at `start`. */
function sharpestInRun(
  start: number,
  isCandidate: (i: number) => boolean,
  turn: Float64Array,
  n: number,
): number {
  let best = start
  for (let j = start; isCandidate(j) && j < start + n; j++) {
    if (turn[j % n] > turn[best % n]) best = j
  }
  return best % n
}

/** Angle between two directions in degrees, 0–180. */
function angleBetween(a: Pt, b: Pt): number {
  const la = Math.hypot(a.x, a.y)
  const lb = Math.hypot(b.x, b.y)
  if (la === 0 || lb === 0) return 0
  const cos = (a.x * b.x + a.y * b.y) / (la * lb)
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
}

export function samePoint(a: Pt, b: Pt): boolean {
  return a.x === b.x && a.y === b.y
}
