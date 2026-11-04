import type { Pt, RugSize } from '../../core/types'

/** Where the calibration shapes go on the projector's screen (px). */
export type CalibrationLayout = {
  /** The rug's bounding frame. */
  frame: { x: number; y: number; w: number; h: number }
  /** The rug's four corners, where crosshairs are drawn. */
  crosshairs: Pt[]
  /** A bar 100 mm long on the cloth (once calibrated), always horizontal, left to right. */
  bar: { from: Pt; to: Pt }
  /** A 100 × 100 mm square: unequal top and bottom edges on the cloth mean a tilted projector. */
  square: { x: number; y: number; size: number }
}

const GAP = 30 // px between the rug and the bar and square, and between those two
const MARGIN = 10 // px kept free at the screen's edge

/**
 * The calibration screen's layout: the rug's frame with corner crosshairs, and the 10 cm bar
 * and 10 × 10 cm square placed outside the rug: below it if there is room, else above, right
 * or left of it, else in the screen's bottom-left corner.
 */
export function calibrationLayout(
  rug: RugSize,
  toScreen: (p: Pt) => Pt,
  scale: number,
  viewport: { w: number; h: number },
): CalibrationLayout {
  const corners = [
    toScreen({ x: 0, y: 0 }),
    toScreen({ x: rug.widthMm, y: 0 }),
    toScreen({ x: rug.widthMm, y: rug.heightMm }),
    toScreen({ x: 0, y: rug.heightMm }),
  ]
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  const frame = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  }
  const size = 100 * scale // 100 mm on the cloth

  // Side by side (below or above the rug) or stacked (beside it).
  const wide = { w: size + GAP + size, h: size }
  const tall = { w: size, h: GAP + size + GAP }
  const fits = (x: number, y: number, box: { w: number; h: number }) =>
    x >= MARGIN &&
    y >= MARGIN &&
    x + box.w <= viewport.w - MARGIN &&
    y + box.h <= viewport.h - MARGIN
  const candidates: { x: number; y: number; stacked: boolean }[] = [
    { x: frame.x, y: frame.y + frame.h + GAP, stacked: false },
    { x: frame.x, y: frame.y - GAP - wide.h, stacked: false },
    { x: frame.x + frame.w + GAP, y: frame.y, stacked: true },
    { x: frame.x - GAP - tall.w, y: frame.y, stacked: true },
  ]
  const place = candidates.find((c) => fits(c.x, c.y, c.stacked ? tall : wide)) ?? {
    x: MARGIN,
    y: viewport.h - MARGIN - wide.h,
    stacked: false,
  }

  const bar = place.stacked
    ? {
        from: { x: place.x, y: place.y + GAP / 2 },
        to: { x: place.x + size, y: place.y + GAP / 2 },
      }
    : {
        from: { x: place.x, y: place.y + size / 2 },
        to: { x: place.x + size, y: place.y + size / 2 },
      }
  const square = place.stacked
    ? { x: place.x, y: place.y + GAP, size }
    : { x: place.x + size + GAP, y: place.y, size }

  return { frame, crosshairs: corners, bar, square }
}

/** Draws the layout white on black (crosshairs 20 px each way, the bar with end ticks). */
export function drawCalibration(
  ctx: CanvasRenderingContext2D,
  layout: CalibrationLayout,
  viewport: { w: number; h: number },
): void {
  ctx.save()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, viewport.w, viewport.h)
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 2

  const f = layout.frame
  ctx.strokeRect(f.x, f.y, f.w, f.h)
  for (const c of layout.crosshairs) {
    ctx.beginPath()
    ctx.moveTo(c.x - 20, c.y)
    ctx.lineTo(c.x + 20, c.y)
    ctx.moveTo(c.x, c.y - 20)
    ctx.lineTo(c.x, c.y + 20)
    ctx.stroke()
  }

  const { from, to } = layout.bar
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  for (const end of [from, to]) {
    ctx.moveTo(end.x, end.y - 8)
    ctx.lineTo(end.x, end.y + 8)
  }
  ctx.stroke()
  ctx.font = '14px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('10 cm', (from.x + to.x) / 2, from.y - 12)

  const sq = layout.square
  ctx.strokeRect(sq.x, sq.y, sq.size, sq.size)
  // Under the square, not inside it: on a small picture the label is wider than the square.
  ctx.textBaseline = 'top'
  ctx.fillText('10 × 10 cm', sq.x + sq.size / 2, sq.y + sq.size + 6)
  ctx.restore()
}
