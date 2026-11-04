import { describe, expect, it } from 'vitest'
import { findThinParts, thickenLabel } from '../../../src/core/cleanup/thin'
import { type ImageGrid, type LabelMap, NO_LABEL, type RGB } from '../../../src/core/types'
import { FIXTURE, thinOutline, triforce } from '../../fixtures/images'

/** Label map from an image: each listed colour gets its index as label. */
function labelsOf(img: ImageGrid, colours: RGB[], mmPerPx = 1): LabelMap {
  const labels = new Uint8Array(img.width * img.height)
  for (let p = 0; p < labels.length; p++) {
    const i = colours.findIndex(
      (c) => img.data[p * 4] === c.r && img.data[p * 4 + 1] === c.g && img.data[p * 4 + 2] === c.b,
    )
    labels[p] = i === -1 ? NO_LABEL : i
  }
  return { width: img.width, height: img.height, mmPerPx, labels }
}

const WHITE = 0
const BLACK = 1
const RED = 2
const outlineMap = (lineWidthPx: number) =>
  labelsOf(thinOutline(200, lineWidthPx), [FIXTURE.white, FIXTURE.black, FIXTURE.red])

describe('findThinParts', () => {
  it('warns about a 1 mm line when the minimum is 3 mm, and only about that line', () => {
    const parts = findThinParts(outlineMap(1), 3)
    expect(parts.length).toBeGreaterThan(0)
    expect(parts.every((p) => p.label === BLACK)).toBe(true)
    for (const p of parts) expect(p.widthMm).toBeLessThan(3)
  })

  it('points at the line: each warning lies on a black pixel, in mm', () => {
    const map = outlineMap(1)
    for (const p of findThinParts(map, 3)) {
      const x = Math.floor(p.at.x / map.mmPerPx)
      const y = Math.floor(p.at.y / map.mmPerPx)
      expect(map.labels[y * map.width + x]).toBe(BLACK)
    }
  })

  it('gives no warning when the line is wide enough', () => {
    expect(findThinParts(outlineMap(4), 3)).toEqual([])
  })

  it('measures in mm: a 2 px line at 2 mm/px is 4 mm wide, fine for a 3 mm minimum', () => {
    const map = { ...outlineMap(2), mmPerPx: 2 }
    expect(findThinParts(map, 3)).toEqual([])
    expect(findThinParts({ ...outlineMap(2), mmPerPx: 1 }, 3).length).toBeGreaterThan(0)
  })

  it('flags and thickens a straight 1 px line across the whole map', () => {
    // Its bounding box is a single row: the neighbouring colour lies just outside it.
    const w = 60
    const labels = new Uint8Array(w * 20)
    for (let x = 0; x < w; x++) labels[10 * w + x] = 1
    const map = { width: w, height: 20, mmPerPx: 1, labels }
    expect(findThinParts(map, 3).map((p) => p.label)).toEqual([1])
    const thick = thickenLabel(map, 1, 3)
    for (let x = 0; x < w; x++) {
      expect([9, 10, 11].every((y) => thick.labels[y * w + x] === 1)).toBe(true)
    }
  })

  it('does not warn about the sharp tips of the Triforce', () => {
    const map = labelsOf(triforce(300), [FIXTURE.gold, FIXTURE.dark])
    expect(findThinParts(map, 5)).toEqual([])
  })
})

describe('thickenLabel', () => {
  it('makes a 1 mm line at least 3 mm wide everywhere', () => {
    const thick = thickenLabel(outlineMap(1), BLACK, 3)
    expect(findThinParts(thick, 3).filter((p) => p.label === BLACK)).toEqual([])
  })

  it('keeps every pixel of the line and leaves areas away from it alone', () => {
    const map = outlineMap(1)
    const thick = thickenLabel(map, BLACK, 3)
    const w = map.width
    for (let p = 0; p < map.labels.length; p++) {
      if (map.labels[p] === BLACK) expect(thick.labels[p]).toBe(BLACK)
      // More than 3 mm from any line pixel: unchanged.
      const x = p % w
      const y = Math.floor(p / w)
      let near = false
      for (let dy = -3; dy <= 3 && !near; dy++) {
        for (let dx = -3; dx <= 3 && !near; dx++) {
          const q = (y + dy) * w + (x + dx)
          if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < map.height) {
            near = map.labels[q] === BLACK
          }
        }
      }
      if (!near) expect(thick.labels[p]).toBe(map.labels[p])
    }
  })

  it('leaves the red dot and the white areas mostly as they were', () => {
    const map = outlineMap(1)
    const thick = thickenLabel(map, BLACK, 3)
    const count = (m: LabelMap, l: number) => m.labels.filter((v) => v === l).length
    expect(count(thick, RED)).toBe(count(map, RED))
    expect(count(thick, WHITE)).toBeGreaterThan(0.95 * count(map, WHITE))
  })

  it('never grows into the outside of the rug', () => {
    const map = outlineMap(1)
    // Make everything outside the ring transparent.
    const c = Math.floor(200 / 2) + 0.5
    for (let p = 0; p < map.labels.length; p++) {
      if (Math.hypot((p % 200) + 0.5 - c, Math.floor(p / 200) + 0.5 - c) > 0.35 * 200 + 0.5) {
        map.labels[p] = NO_LABEL
      }
    }
    const thick = thickenLabel(map, BLACK, 3)
    for (let p = 0; p < map.labels.length; p++) {
      if (map.labels[p] === NO_LABEL) expect(thick.labels[p]).toBe(NO_LABEL)
    }
  })

  it('does not change the input', () => {
    const map = outlineMap(1)
    const before = Uint8Array.from(map.labels)
    thickenLabel(map, BLACK, 3)
    expect(map.labels).toEqual(before)
  })
})
