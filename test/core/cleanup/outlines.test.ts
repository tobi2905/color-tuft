import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { addOutlines, suggestOutlines } from '../../../src/core/cleanup/outlines'
import { findThinParts } from '../../../src/core/cleanup/thin'
import { type ImageGrid, type LabelMap, NO_LABEL, type RGB } from '../../../src/core/types'
import { FIXTURE, sixColours, thinOutline, triforce } from '../../fixtures/images'

function labelsOf(img: ImageGrid, colours: RGB[]): LabelMap {
  const labels = new Uint8Array(img.width * img.height)
  for (let p = 0; p < labels.length; p++) {
    const i = colours.findIndex(
      (c) => img.data[p * 4] === c.r && img.data[p * 4 + 1] === c.g && img.data[p * 4 + 2] === c.b,
    )
    labels[p] = i === -1 ? NO_LABEL : i
  }
  return { width: img.width, height: img.height, mmPerPx: 1, labels }
}

const SIX = [FIXTURE.red, FIXTURE.green, FIXTURE.blue, FIXTURE.gold, FIXTURE.black, FIXTURE.white]
const OUTLINE = 6 // a new palette entry, after the six tile colours

/** sixColours (150 px = 150 mm) inside a 20 px transparent frame. */
function framedSix(): LabelMap {
  const inner = labelsOf(sixColours(150), SIX)
  const size = 190
  const labels = new Uint8Array(size * size).fill(NO_LABEL)
  for (let y = 0; y < 150; y++) {
    labels.set(inner.labels.subarray(y * 150, (y + 1) * 150), (y + 20) * size + 20)
  }
  return { width: size, height: size, mmPerPx: 1, labels }
}

/** Distance from each pixel centre to the nearest crack between two different labels, brute force. */
function crackDistances(map: LabelMap, isChosen: (a: number, b: number) => boolean): Float64Array {
  const { width: w, height: h, labels } = map
  const cracks: [number, number][] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = labels[y * w + x]
      if (x + 1 < w && isChosen(a, labels[y * w + x + 1])) cracks.push([x + 1, y + 0.5])
      if (y + 1 < h && isChosen(a, labels[(y + 1) * w + x])) cracks.push([x + 0.5, y + 1])
    }
  }
  const out = new Float64Array(w * h).fill(Infinity)
  for (let p = 0; p < w * h; p++) {
    const cx = (p % w) + 0.5
    const cy = Math.floor(p / w) + 0.5
    for (const [x, y] of cracks) out[p] = Math.min(out[p], Math.hypot(cx - x, cy - y))
  }
  return out
}

const between = (a: number, b: number) => a !== b && a !== NO_LABEL && b !== NO_LABEL

describe('addOutlines', () => {
  it('changes nothing at width 0', () => {
    const map = framedSix()
    expect(addOutlines(map, { widthMm: 0, label: OUTLINE, where: 'all' }).labels).toEqual(
      map.labels,
    )
  })

  it("'all': a 10 mm line along every border between tiles, at least 10 mm wide everywhere", () => {
    const map = framedSix()
    const out = addOutlines(map, { widthMm: 10, label: OUTLINE, where: 'all' })
    expect(findThinParts(out, 10).filter((p) => p.label === OUTLINE)).toEqual([])
    // Every pixel right next to a tile border is outline.
    const d = crackDistances(map, between)
    for (let p = 0; p < d.length; p++) if (d[p] <= 0.5) expect(out.labels[p]).toBe(OUTLINE)
  })

  it("'all': centred on tile borders, never more than 5 mm from one (or 10 mm inside the edge)", () => {
    const map = framedSix()
    const out = addOutlines(map, { widthMm: 10, label: OUTLINE, where: 'all' })
    const inner = crackDistances(map, between)
    const edge = crackDistances(map, (a, b) => (a === NO_LABEL) !== (b === NO_LABEL))
    for (let p = 0; p < out.labels.length; p++) {
      if (out.labels[p] === OUTLINE) expect(inner[p] <= 5 || edge[p] <= 10).toBe(true)
    }
  })

  it("'outer': only along the edge of the rug, fully inside it", () => {
    const map = framedSix()
    const out = addOutlines(map, { widthMm: 10, label: OUTLINE, where: 'outer' })
    const edge = crackDistances(map, (a, b) => (a === NO_LABEL) !== (b === NO_LABEL))
    for (let p = 0; p < out.labels.length; p++) {
      if (map.labels[p] === NO_LABEL) expect(out.labels[p]).toBe(NO_LABEL)
      else if (edge[p] <= 0.5) expect(out.labels[p]).toBe(OUTLINE)
      else if (edge[p] > 10) expect(out.labels[p]).toBe(map.labels[p])
    }
  })

  it('treats the edge of the map as the edge of a rectangular rug', () => {
    const map = labelsOf(sixColours(150), SIX) // no transparent frame
    const out = addOutlines(map, { widthMm: 6, label: OUTLINE, where: 'outer' })
    for (let x = 0; x < 150; x++) expect(out.labels[x]).toBe(OUTLINE) // top row
    expect(out.labels[75 * 150 + 75]).toBe(map.labels[75 * 150 + 75]) // middle untouched
  })

  it('outlines only a chosen pair of colours', () => {
    const map = framedSix()
    const [RED, GREEN] = [0, 1]
    const out = addOutlines(map, { widthMm: 6, label: OUTLINE, where: { pairs: [[GREEN, RED]] } })
    const chosen = crackDistances(
      map,
      (a, b) => (a === RED && b === GREEN) || (a === GREEN && b === RED),
    )
    let outlined = 0
    for (let p = 0; p < out.labels.length; p++) {
      if (out.labels[p] !== OUTLINE) continue
      outlined++
      expect(chosen[p]).toBeLessThanOrEqual(3)
    }
    expect(outlined).toBeGreaterThan(0)
  })

  it('does not change the input', () => {
    const map = framedSix()
    const before = Uint8Array.from(map.labels)
    addOutlines(map, { widthMm: 10, label: OUTLINE, where: 'all' })
    expect(map.labels).toEqual(before)
  })
})

describe('suggestOutlines', () => {
  it('suggests the black of line art', () => {
    const colours = [FIXTURE.white, FIXTURE.black, FIXTURE.red]
    const map = labelsOf(thinOutline(200, 3), colours)
    expect(suggestOutlines(map, colours.map(srgbToOklab))).toBe(1)
  })

  it('suggests nothing for the Triforce (its dark is a background, not lines)', () => {
    const colours = [FIXTURE.gold, FIXTURE.dark]
    expect(suggestOutlines(labelsOf(triforce(200), colours), colours.map(srgbToOklab))).toBeNull()
  })

  it('suggests nothing when the thin lines are not dark', () => {
    // The same line art with a light grey line instead of black.
    const grey = { r: 200, g: 200, b: 200 }
    const map = labelsOf(thinOutline(200, 3), [FIXTURE.white, FIXTURE.black, FIXTURE.red])
    expect(suggestOutlines(map, [FIXTURE.white, grey, FIXTURE.red].map(srgbToOklab))).toBeNull()
  })
})
