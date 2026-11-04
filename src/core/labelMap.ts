import { type LabelMap, NO_LABEL, type Pt } from './types'

/** The label of the pixel under a point (mm); NO_LABEL outside the map. Used for hovering. */
export function labelAt(map: LabelMap, pt: Pt): number {
  const x = Math.floor(pt.x / map.mmPerPx)
  const y = Math.floor(pt.y / map.mmPerPx)
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return NO_LABEL
  return map.labels[y * map.width + x]
}
