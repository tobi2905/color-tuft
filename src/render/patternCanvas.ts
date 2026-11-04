import { polygonArea } from '../core/geometry'
import { poleOfInaccessibility } from '../core/labelPoint'
import { ringToPolygon } from '../core/trace/pattern'
import type { PaletteEntry, Pt, Region, RingRef, VectorPattern } from '../core/types'

export type DrawOptions = {
  /** Canvas pixels per mm. */
  scale: number
  numbers: boolean
  outlines: boolean
  /** Only this label at full strength, the others faded; null = all. */
  highlight: number | null
}

/** Numbers are drawn this size on screen (px), and only in areas big enough for them. */
const NUMBER_PX = 12
const FADED = 0.18

type Prepared = {
  paths: Path2D[] // one per region, holes included
  edges: Path2D // every border once
  labels: { at: Pt; roomMm: number }[] // number position and the free space around it
}
const cache = new WeakMap<VectorPattern, Prepared>()

/**
 * Draws the pattern: every area filled in its palette colour, thin borders, and each area's
 * palette number at its deepest point (colour never stands alone). With a highlight, the other
 * colours fade, to show where one colour sits.
 */
export function drawPattern(
  ctx: CanvasRenderingContext2D,
  pattern: VectorPattern,
  palette: PaletteEntry[],
  opts: DrawOptions,
): void {
  const prep = prepare(pattern)
  const { scale } = opts
  ctx.save()
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.scale(scale, scale)

  pattern.regions.forEach((region, i) => {
    const entry = palette[region.label]
    if (!entry) return
    ctx.globalAlpha = opts.highlight === null || opts.highlight === region.label ? 1 : FADED
    ctx.fillStyle = entry.hex
    ctx.fill(prep.paths[i], 'evenodd')
  })
  ctx.globalAlpha = 1

  if (opts.outlines) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.lineWidth = 1 / scale // one canvas pixel, whatever the zoom
    ctx.stroke(prep.edges)
  }

  if (opts.numbers) {
    const sizeMm = NUMBER_PX / scale
    ctx.font = `600 ${sizeMm}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    pattern.regions.forEach((region, i) => {
      const entry = palette[region.label]
      const { at, roomMm } = prep.labels[i]
      if (!entry || roomMm < sizeMm * 0.6) return // too small: the projector adds pointers (8.3)
      if (opts.highlight !== null && opts.highlight !== region.label) return
      ctx.fillStyle = entry.lab.L > 0.6 ? '#1d1d1f' : '#ffffff'
      ctx.fillText(String(entry.number), at.x, at.y)
    })
  }
  ctx.restore()
}

function prepare(pattern: VectorPattern): Prepared {
  const cached = cache.get(pattern)
  if (cached) return cached
  const paths = pattern.regions.map((r) => regionPath(pattern, r))
  const edges = new Path2D()
  for (const e of pattern.edges) {
    edges.moveTo(e.start.x, e.start.y)
    for (const s of e.segs) {
      if (s.kind === 'line') edges.lineTo(s.to.x, s.to.y)
      else edges.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.to.x, s.to.y)
    }
  }
  const labels = pattern.regions.map((r) => {
    const polygons = r.rings.map((ring) => ringToPolygon(pattern, ring, 8))
    // Outer ring first: it is the one with the largest area.
    polygons.sort((a, b) => polygonArea(b) - polygonArea(a))
    const at = poleOfInaccessibility(polygons, 1)
    return { at, roomMm: distanceToEdges(at, polygons) }
  })
  const prepared = { paths, edges, labels }
  cache.set(pattern, prepared)
  return prepared
}

/** A region as one path: each ring traced along its edges, backwards where marked. */
function regionPath(pattern: VectorPattern, region: Region): Path2D {
  const path = new Path2D()
  for (const ring of region.rings) addRing(path, pattern, ring)
  return path
}

function addRing(path: Path2D, pattern: VectorPattern, ring: RingRef): void {
  ring.forEach((ref, i) => {
    const edge = pattern.edges[ref.edgeId]
    // The points each segment starts from: the edge's start, then each segment's end.
    const starts = [edge.start, ...edge.segs.map((s) => s.to)]
    if (!ref.reversed) {
      if (i === 0) path.moveTo(edge.start.x, edge.start.y)
      for (const s of edge.segs) {
        if (s.kind === 'line') path.lineTo(s.to.x, s.to.y)
        else path.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.to.x, s.to.y)
      }
    } else {
      const end = starts[starts.length - 1]
      if (i === 0) path.moveTo(end.x, end.y)
      // Walk the segments backwards: a curve reversed swaps its two control points.
      for (let k = edge.segs.length - 1; k >= 0; k--) {
        const s = edge.segs[k]
        const to = starts[k]
        if (s.kind === 'line') path.lineTo(to.x, to.y)
        else path.bezierCurveTo(s.c2.x, s.c2.y, s.c1.x, s.c1.y, to.x, to.y)
      }
    }
  })
  path.closePath()
}

function distanceToEdges(p: Pt, polygons: Pt[][]): number {
  let best = Infinity
  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = dx * dx + dy * dy
      const t =
        len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
      best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
    }
  }
  return best
}
