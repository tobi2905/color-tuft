import type { CutLoop } from '../../core/outline/cutLine'
import type { PaletteEntry, VectorPattern } from '../../core/types'
import { edgesPath, regionLabelPoints } from '../patternCanvas'
import { placeLabels } from './labels'
import { type ProjectorOptions, projectorTransform } from './transform'

/** Which layers the projector shows, each switchable. */
export type LayerOptions = {
  outlines: boolean
  /** Outline thickness on screen (px). */
  lineWidthPx: number
  numbers: boolean
  /** Number size on the cloth (mm). */
  fontMm: number
  cut: boolean
  grid: boolean
}

/** Grid lines every this many mm (10 cm). */
export const GRID_MM = 100

/**
 * The pattern for the projector, white on black: grid, outlines and cut line are drawn in rug
 * mm through the projector transform (so they are mirrored with it); numbers and their
 * pointer lines are drawn in screen space, so the digits are never mirrored. Numbers that
 * don't fit their area sit outside it with a pointer (placeLabels): no two overlap.
 * `ctx` is set up in CSS pixels (device pixel ratio already applied).
 */
export function drawProjectorPattern(
  ctx: CanvasRenderingContext2D,
  pattern: VectorPattern,
  palette: PaletteEntry[],
  cut: CutLoop[] | null,
  projector: ProjectorOptions,
  layers: LayerOptions,
): void {
  const t = projectorTransform(projector)
  const origin = t.toScreen({ x: 0, y: 0 })
  const xStep = t.toScreen({ x: 1, y: 0 }).x - origin.x // ±scale: negative when mirrored
  const s = t.scale

  ctx.save()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, projector.viewport.w, projector.viewport.h)

  // Rug mm → screen, mirroring included.
  ctx.save()
  ctx.transform(xStep, 0, 0, s, origin.x, origin.y)
  if (layers.grid) {
    ctx.beginPath()
    for (let x = 0; x <= pattern.rug.widthMm; x += GRID_MM) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, pattern.rug.heightMm)
    }
    for (let y = 0; y <= pattern.rug.heightMm; y += GRID_MM) {
      ctx.moveTo(0, y)
      ctx.lineTo(pattern.rug.widthMm, y)
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.lineWidth = 1 / s
    ctx.stroke()
  }
  if (layers.outlines) {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = layers.lineWidthPx / s
    ctx.lineJoin = 'round'
    ctx.stroke(edgesPath(pattern))
  }
  if (layers.cut && cut) {
    const path = new Path2D()
    for (const loop of cut) {
      path.moveTo(loop.start.x, loop.start.y)
      for (const seg of loop.segs) {
        if (seg.kind === 'line') path.lineTo(seg.to.x, seg.to.y)
        else path.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.to.x, seg.to.y)
      }
      path.closePath()
    }
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = Math.max(1, layers.lineWidthPx) / s
    ctx.setLineDash([10 / s, 8 / s])
    ctx.stroke(path)
    ctx.setLineDash([])
  }
  ctx.restore()

  if (layers.numbers) {
    const points = regionLabelPoints(pattern)
    const inputs = pattern.regions.flatMap((region, i) => {
      const entry = palette[region.label]
      return entry
        ? [{ id: i, text: String(entry.number), at: points[i].at, roomMm: points[i].roomMm }]
        : []
    })
    const placed = placeLabels(inputs, layers.fontMm)
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.font = `600 ${layers.fontMm * s}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const label of placed) {
      if (label.pointer) {
        const from = t.toScreen(label.pointer.from)
        const to = t.toScreen(label.pointer.to)
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      }
      const c = t.toScreen(label.centre)
      ctx.fillText(label.text, c.x, c.y)
    }
  }
  ctx.restore()
}
