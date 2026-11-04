import { describe, expect, it } from 'vitest'
import { fitToRug } from '../../../src/core/image/fitToRug'
import type { ImageGrid, RGB } from '../../../src/core/types'
import { FIXTURE, circle, withSoftAlpha } from '../../fixtures/images'

/** An opaque image from a list of rows of colours. */
function imageFrom(rows: RGB[][]): ImageGrid {
  const height = rows.length
  const width = rows[0].length
  const data = new Uint8ClampedArray(width * height * 4)
  rows.flat().forEach((c, p) => data.set([c.r, c.g, c.b, 255], p * 4))
  return { width, height, data }
}

function solid(width: number, height: number, c: RGB): ImageGrid {
  return imageFrom(Array.from({ length: height }, () => Array.from({ length: width }, () => c)))
}

const pixel = (img: ImageGrid, x: number, y: number) => {
  const i = (y * img.width + x) * 4
  return Array.from(img.data.subarray(i, i + 4))
}

function rowAlphas(img: ImageGrid, y: number): number[] {
  return Array.from({ length: img.width }, (_, x) => img.data[(y * img.width + x) * 4 + 3])
}

const { black, white, red } = FIXTURE

describe('fitToRug', () => {
  it('fits a wide image into a less wide rug: full width, centred, transparent above and below', () => {
    const out = fitToRug(solid(200, 100, red), { widthMm: 800, heightMm: 600 }, 1)
    expect([out.width, out.height]).toEqual([800, 600])
    for (let y = 0; y < 600; y++) {
      const expected = y >= 100 && y < 500 ? 255 : 0
      expect(rowAlphas(out, y).every((a) => a === expected)).toBe(true)
    }
    expect(pixel(out, 400, 300)).toEqual([red.r, red.g, red.b, 255])
  })

  it('fits a tall image into a wide rug: full height, centred, transparent left and right', () => {
    const out = fitToRug(solid(100, 200, red), { widthMm: 600, heightMm: 600 }, 1)
    const alphas = rowAlphas(out, 300)
    expect(alphas.slice(0, 150).every((a) => a === 0)).toBe(true)
    expect(alphas.slice(150, 450).every((a) => a === 255)).toBe(true)
    expect(alphas.slice(450).every((a) => a === 0)).toBe(true)
  })

  it('turns mm into pixels: 800 mm at 2 mm per pixel is 400 pixels', () => {
    const out = fitToRug(solid(100, 100, red), { widthMm: 800, heightMm: 600 }, 2)
    expect([out.width, out.height]).toEqual([400, 300])
  })

  it('copies an image that already has the right size unchanged', () => {
    const img = withSoftAlpha(circle(100), 3)
    expect(fitToRug(img, { widthMm: 100, heightMm: 100 }, 1).data).toEqual(img.data)
  })

  it('shrinks by averaging areas: a 2 × 2 black-and-white checker becomes one mid grey', () => {
    const checker = imageFrom([
      [black, white, black, white],
      [white, black, white, black],
      [black, white, black, white],
      [white, black, white, black],
    ])
    const out = fitToRug(checker, { widthMm: 2, heightMm: 2 }, 1)
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) expect(pixel(out, x, y)).toEqual([128, 128, 128, 255])
    }
  })

  it('enlarges smoothly: black to white across the row, never going back', () => {
    const out = fitToRug(imageFrom([[black, white]]), { widthMm: 200, heightMm: 100 }, 1)
    const reds = Array.from({ length: 200 }, (_, x) => pixel(out, x, 50)[0])
    expect(reds[0]).toBe(0)
    expect(reds[199]).toBe(255)
    for (let x = 1; x < 200; x++) expect(reds[x]).toBeGreaterThanOrEqual(reds[x - 1])
  })

  it('never lets the colour hidden in transparent pixels bleed into the edge', () => {
    // withSoftAlpha keeps white in fully transparent pixels; averaging must ignore it.
    const out = fitToRug(withSoftAlpha(circle(400), 3), { widthMm: 100, heightMm: 100 }, 1)
    let edgePixels = 0
    for (let p = 0; p < out.width * out.height; p++) {
      const [r, g, b, a] = out.data.subarray(p * 4, p * 4 + 4)
      if (a === 0) continue
      if (a < 255) edgePixels++
      expect(
        Math.max(Math.abs(r - red.r), Math.abs(g - red.g), Math.abs(b - red.b)),
      ).toBeLessThanOrEqual(1)
    }
    expect(edgePixels).toBeGreaterThan(0)
  })

  it('does not change the input', () => {
    const img = withSoftAlpha(circle(100), 3)
    const before = new Uint8ClampedArray(img.data)
    fitToRug(img, { widthMm: 300, heightMm: 200 }, 1)
    expect(img.data).toEqual(before)
  })

  it.each([
    [{ widthMm: 0, heightMm: 100 }, 1],
    [{ widthMm: 100, heightMm: -5 }, 1],
    [{ widthMm: 100, heightMm: 100 }, 0],
    [{ widthMm: 100, heightMm: 100 }, Number.NaN],
  ])('rejects an impossible rug or scale: %o at %d mm/px', (rug, mmPerPx) => {
    expect(() => fitToRug(solid(10, 10, red), rug, mmPerPx)).toThrow()
  })
})
