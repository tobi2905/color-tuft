import type { Pt } from '../../core/types'

/** An area's number: where its deepest point is and how much free space there is around it. */
export type LabelInput = { id: number; text: string; at: Pt; roomMm: number }

/** Where a number goes (mm): its box, and a pointer to the area if it sits outside it. */
export type PlacedLabel = {
  id: number
  text: string
  centre: Pt
  box: { x: number; y: number; w: number; h: number }
  pointer: { from: Pt; to: Pt } | null
}

/** Rough width of one digit, as a share of the font size. */
const DIGIT_WIDTH = 0.6
/** Free space around an outside number, as a share of the font size. */
const GAP = 0.3
const DIRECTIONS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4
  return { x: Math.cos(a), y: -Math.sin(a) }
})
const MAX_RINGS = 40

/**
 * Places every area's number so that no two overlap (all in mm, font size fontMm):
 * - biggest areas first, so they keep their spot;
 * - inside the area, at its deepest point, if the area has room for the number there and the
 *   spot is still free;
 * - otherwise outside: tried in 8 directions at growing distances, the first free spot wins,
 *   with a pointer line from the area to the number.
 */
export function placeLabels(labels: LabelInput[], fontMm: number): PlacedLabel[] {
  const placed: PlacedLabel[] = []
  const order = [...labels].sort((a, b) => b.roomMm - a.roomMm || a.id - b.id)

  for (const label of order) {
    const w = label.text.length * DIGIT_WIDTH * fontMm + GAP * fontMm
    const h = fontMm
    const boxAt = (c: Pt) => ({ x: c.x - w / 2, y: c.y - h / 2, w, h })
    const free = (box: PlacedLabel['box']) => placed.every((p) => !overlap(p.box, box))

    const inside = boxAt(label.at)
    if (label.roomMm >= Math.max(w, h) / 2 && free(inside)) {
      placed.push({ id: label.id, text: label.text, centre: label.at, box: inside, pointer: null })
      continue
    }

    let spot: Pt | null = null
    const start = Math.max(label.roomMm, 0) + GAP * fontMm + Math.max(w, h) / 2
    for (let ring = 0; ring < MAX_RINGS && !spot; ring++) {
      const r = start + ring * h
      for (const d of DIRECTIONS) {
        const c = { x: label.at.x + d.x * r, y: label.at.y + d.y * r }
        if (free(boxAt(c))) {
          spot = c
          break
        }
      }
    }
    // Practically never: a crowd too dense for 40 rings. Then it goes straight out to the right.
    spot ??= { x: label.at.x + start + MAX_RINGS * h, y: label.at.y }
    placed.push({
      id: label.id,
      text: label.text,
      centre: spot,
      box: boxAt(spot),
      pointer: { from: label.at, to: towardsBox(label.at, spot, w / 2, h / 2) },
    })
  }
  return placed
}

function overlap(a: PlacedLabel['box'], b: PlacedLabel['box']): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Where the line from `from` to a box's centre meets the box's edge. */
function towardsBox(from: Pt, centre: Pt, halfW: number, halfH: number): Pt {
  const dx = centre.x - from.x
  const dy = centre.y - from.y
  const s = Math.min(
    dx !== 0 ? halfW / Math.abs(dx) : Infinity,
    dy !== 0 ? halfH / Math.abs(dy) : Infinity,
  )
  return { x: centre.x - s * dx, y: centre.y - s * dy }
}
