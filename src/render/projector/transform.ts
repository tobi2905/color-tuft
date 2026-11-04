import type { Pt, RugSize } from '../../core/types'

export type ProjectorOptions = {
  /** The whole pattern (mm). */
  rug: RugSize
  /** The projector's screen (px). */
  viewport: { w: number; h: number }
  /** Starting guess: screen pixels per mm on the cloth. */
  pxPerMm: number
  /** Correction from the calibration bar: expected ÷ measured. */
  calibrationFactor: number
  /** Nudge from the arrow keys (px). */
  offsetPx: Pt
  /** Left and right swapped, for tufting from the back of the cloth. */
  mirror: boolean
}

/**
 * Where rug points (mm) go on the projector's screen (px), and back. The rug is centred on the
 * screen, then moved by offsetPx. Scale: pxPerMm × calibrationFactor screen pixels per mm.
 * Mirrored: left and right swap around the rug's centre (tufting is done from the back).
 */
export function projectorTransform(opts: ProjectorOptions): {
  toScreen(p: Pt): Pt
  toRug(s: Pt): Pt
  scale: number
} {
  const scale = opts.pxPerMm * opts.calibrationFactor
  const cx = opts.viewport.w / 2 + opts.offsetPx.x
  const cy = opts.viewport.h / 2 + opts.offsetPx.y
  const mid = { x: opts.rug.widthMm / 2, y: opts.rug.heightMm / 2 }
  const flip = opts.mirror ? -1 : 1
  return {
    scale,
    toScreen: (p) => ({ x: cx + flip * (p.x - mid.x) * scale, y: cy + (p.y - mid.y) * scale }),
    toRug: (s) => ({ x: mid.x + (flip * (s.x - cx)) / scale, y: mid.y + (s.y - cy) / scale }),
  }
}

/**
 * The correction after measuring the calibration bar on the cloth: a bar meant to be
 * expectedMm long measured measuredMm, so everything is scaled by expected ÷ measured.
 */
export function calibrationFactor(expectedMm: number, measuredMm: number): number {
  if (!(measuredMm > 0) || !(expectedMm > 0)) {
    throw new Error(`Measured length must be a positive number of mm, got ${measuredMm}.`)
  }
  return expectedMm / measuredMm
}
