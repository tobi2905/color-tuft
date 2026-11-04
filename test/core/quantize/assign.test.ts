import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { fitToRug } from '../../../src/core/image/fitToRug'
import { assignLabels } from '../../../src/core/quantize/assign'
import { findPalette } from '../../../src/core/quantize/palette'
import { samplePixels } from '../../../src/core/quantize/sample'
import { type ImageGrid, NO_LABEL, type OKLab } from '../../../src/core/types'
import { FIXTURE, triforce } from '../../fixtures/images'

const paletteOf = (img: ImageGrid, count: number) =>
  findPalette(samplePixels(img, 20_000, 1), { count, locked: [], seed: 1 })

const gold = srgbToOklab(FIXTURE.gold)
const dark = srgbToOklab(FIXTURE.dark)

/** An image from RGBA quadruples, one row. */
function row(...pixels: [number, number, number, number][]): ImageGrid {
  return { width: pixels.length, height: 1, data: new Uint8ClampedArray(pixels.flat()) }
}

describe('assignLabels', () => {
  it('gives the Triforce only labels 0 and 1, gold where gold was', () => {
    const img = triforce(200)
    const palette = paletteOf(img, 2)
    const map = assignLabels(img, palette, 1)
    expect(new Set(map.labels)).toEqual(new Set([0, 1]))
    const goldLabel = palette[0].L > palette[1].L ? 0 : 1
    for (let p = 0; p < 200 * 200; p++) {
      const isGold = img.data[p * 4] === FIXTURE.gold.r
      expect(map.labels[p] === goldLabel).toBe(isGold)
    }
  })

  it('keeps size and scale', () => {
    const map = assignLabels(triforce(50), [gold, dark], 2)
    expect([map.width, map.height, map.mmPerPx, map.labels.length]).toEqual([50, 50, 2, 2500])
  })

  it('marks pixels under 50% alpha as outside the rug', () => {
    const map = assignLabels(
      row([255, 215, 0, 100], [255, 215, 0, 200], [255, 215, 0, 127], [255, 215, 0, 128]),
      [gold, dark],
      1,
    )
    expect(Array.from(map.labels)).toEqual([NO_LABEL, 0, NO_LABEL, 0])
  })

  it('splits a blended edge between the two colours, keeping the areas', () => {
    // Shrinking blends the edges; each blend pixel goes to whichever colour it is closer to,
    // so the gold area stays within 2% of the sharp original.
    const sharp = triforce(200)
    const smooth = fitToRug(triforce(800), { widthMm: 200, heightMm: 200 }, 1)
    const palette = paletteOf(smooth, 2)
    const goldLabel = palette[0].L > palette[1].L ? 0 : 1
    const goldPixels = assignLabels(smooth, palette, 1).labels.filter((l) => l === goldLabel).length
    let sharpGold = 0
    for (let p = 0; p < 200 * 200; p++) if (sharp.data[p * 4] === FIXTURE.gold.r) sharpGold++
    expect(Math.abs(goldPixels - sharpGold) / sharpGold).toBeLessThan(0.02)
  })

  it('uses the nearest colour by how different it looks (OKLab), not by RGB', () => {
    // (0,0,60) is exactly halfway in RGB between (0,0,40) and (0,0,80); only the OKLab
    // distance can break the tie, so the label must match OKLab's answer.
    const a = srgbToOklab({ r: 0, g: 0, b: 40 })
    const b = srgbToOklab({ r: 0, g: 0, b: 80 })
    const c = srgbToOklab({ r: 0, g: 0, b: 60 })
    const dist = (x: OKLab, y: OKLab) => Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b)
    const expected = dist(c, a) < dist(c, b) ? 0 : 1
    expect(assignLabels(row([0, 0, 60, 255]), [a, b], 1).labels[0]).toBe(expected)
  })

  it('rejects an empty palette and one too long for a label byte', () => {
    expect(() => assignLabels(triforce(10), [], 1)).toThrow()
    const tooMany = Array.from({ length: 255 }, (_, i) => ({ L: i / 255, a: 0, b: 0 }))
    expect(() => assignLabels(triforce(10), tooMany, 1)).toThrow()
  })
})
