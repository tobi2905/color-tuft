import type { CutLoop } from '../../core/outline/cutLine'
import type { PaletteEntry, Pt, RugSize, VectorPattern } from '../../core/types'
import { calibrationLayout, drawCalibration } from './calibration'
import { type LayerOptions, drawProjectorPattern } from './layers'
import { projectorTransform } from './transform'

/** What a projector picture is drawn from (the laptop and the projector window alike). */
export type ProjectorPicture = {
  rug: RugSize
  pattern: VectorPattern | null
  palette: PaletteEntry[]
  cut: CutLoop[] | null
  projector: {
    pxPerMm: number | null
    factor: number
    offsetPx: Pt
    mirror: boolean
    layers: LayerOptions
    focus: number | null
    mode: 'calibrate' | 'pattern'
  }
}

/**
 * Draws the projector picture into a canvas of `viewport` CSS pixels (scaled for the screen's
 * density): the calibration picture, or the pattern layers. Nothing until a scale is set.
 */
export function drawProjector(
  canvas: HTMLCanvasElement,
  viewport: { w: number; h: number },
  picture: ProjectorPicture,
): void {
  const ctx = canvas.getContext('2d')
  const { projector } = picture
  if (!ctx || viewport.w === 0 || projector.pxPerMm === null) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = viewport.w * dpr
  canvas.height = viewport.h * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const options = {
    rug: picture.rug,
    viewport,
    pxPerMm: projector.pxPerMm,
    calibrationFactor: projector.factor,
    offsetPx: projector.offsetPx,
    mirror: projector.mirror,
  }
  if (projector.mode === 'pattern' && picture.pattern) {
    drawProjectorPattern(
      ctx,
      picture.pattern,
      picture.palette,
      picture.cut,
      options,
      projector.layers,
      projector.focus,
    )
  } else {
    const t = projectorTransform(options)
    drawCalibration(ctx, calibrationLayout(picture.rug, t.toScreen, t.scale, viewport), viewport)
  }
}
