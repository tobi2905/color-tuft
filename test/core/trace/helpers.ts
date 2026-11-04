import { traceBorders } from '../../../src/core/trace/borders'
import type { ImageGrid, LabelMap, PathSeg, Pt, RGB } from '../../../src/core/types'

/** Label map from an image: the listed colour is 1, everything else 0. */
export function twoColourMap(img: ImageGrid, colour: RGB, mmPerPx = 1): LabelMap {
  const labels = new Uint8Array(img.width * img.height)
  for (let p = 0; p < labels.length; p++) {
    const d = img.data
    labels[p] =
      d[p * 4] === colour.r && d[p * 4 + 1] === colour.g && d[p * 4 + 2] === colour.b ? 1 : 0
  }
  return { width: img.width, height: img.height, mmPerPx, labels }
}

/** The traced loops around the areas of label 1. */
export function loopsOf(map: LabelMap): Pt[][] {
  return traceBorders(map)
    .edges.filter((e) => e.left === 1 || e.right === 1)
    .map((e) => e.points)
}

/** Points along a fitted path, `steps` per curve (lines: just their end). */
export function samplePath(start: Pt, segs: PathSeg[], steps = 20): Pt[] {
  const out = [start]
  let from = start
  for (const s of segs) {
    if (s.kind === 'line') out.push(s.to)
    else {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const u = 1 - t
        out.push({
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
    }
    from = s.to
  }
  return out
}

/** Direction (radians) a segment leaves its start and arrives at its end. */
export function segDirections(from: Pt, s: PathSeg): { out: number; in: number } {
  const angle = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x)
  if (s.kind === 'line') return { out: angle(from, s.to), in: angle(from, s.to) }
  return { out: angle(from, s.c1), in: angle(s.c2, s.to) }
}

/** Turn between two directions in degrees, 0–180. */
export function turnDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % (2 * Math.PI)
  if (d > Math.PI) d = 2 * Math.PI - d
  return (d * 180) / Math.PI
}

/** A staircase of pixel steps: `pattern` repeated, 'R' = one step right, 'D' = one down. */
export function staircase(pattern: string, repeats: number, origin: Pt = { x: 0, y: 0 }): Pt[] {
  const pts = [origin]
  let { x, y } = origin
  for (let i = 0; i < repeats; i++) {
    for (const ch of pattern) {
      if (ch === 'R') x++
      else y++
      pts.push({ x, y })
    }
  }
  return pts
}
