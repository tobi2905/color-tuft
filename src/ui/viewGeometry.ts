import { labelAt } from '../core/labelMap'
import { NO_LABEL, type LabelMap, type Pt, type RugSize } from '../core/types'

/** The two views are drawn with their long side this many CSS pixels (times the screen density). */
const VIEW_PX = 640

/** Canvas size for a rug: long side VIEW_PX CSS pixels, sharp on high-density screens. */
export function viewSize(rug: RugSize) {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const long = Math.max(rug.widthMm, rug.heightMm)
  const scale = (VIEW_PX * dpr) / long // canvas pixels per mm
  return { width: Math.round(rug.widthMm * scale), height: Math.round(rug.heightMm * scale), scale }
}

/** Mouse position on a canvas, in rug mm. */
export function mmAt(e: React.MouseEvent<HTMLCanvasElement>, rug: RugSize) {
  const r = e.currentTarget.getBoundingClientRect()
  return {
    x: ((e.clientX - r.left) / r.width) * rug.widthMm,
    y: ((e.clientY - r.top) / r.height) * rug.heightMm,
  }
}

/** The label under a point, or null outside the rug. */
export function labelOrNull(map: LabelMap, pt: Pt) {
  const label = labelAt(map, pt)
  return label === NO_LABEL ? null : label
}
