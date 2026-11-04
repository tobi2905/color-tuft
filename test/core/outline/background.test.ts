import { describe, expect, it } from 'vitest'
import { detectBackground } from '../../../src/core/outline/background'
import type { ImageGrid, RGB } from '../../../src/core/types'
import {
  FIXTURE,
  circle,
  sixColours,
  thinOutline,
  triforce,
  withJpegNoise,
  withSoftAlpha,
} from '../../fixtures/images'

const is = (img: ImageGrid, p: number, c: RGB) =>
  img.data[p * 4] === c.r && img.data[p * 4 + 1] === c.g && img.data[p * 4 + 2] === c.b

/**
 * Pixels where the mask disagrees with `isBackground`, ignoring those within 2 px of an edge:
 * soft (anti-aliased) edges round off sharp tips by a pixel or two, which is expected.
 */
function mismatchesAwayFromEdges(
  img: ImageGrid,
  mask: Uint8Array,
  isBackground: (p: number) => boolean,
) {
  const { width: w, height: h } = img
  let bad = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const want = isBackground(p)
      let nearEdge = false
      for (let dy = -2; dy <= 2 && !nearEdge; dy++) {
        for (let dx = -2; dx <= 2 && !nearEdge; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && isBackground(ny * w + nx) !== want) {
            nearEdge = true
          }
        }
      }
      if (!nearEdge && (mask[p] === 1) !== want) bad++
    }
  }
  return bad
}

describe('detectBackground', () => {
  it('uses transparency when the image has it, matching the shape within 2 px', () => {
    const sharp = triforce(200)
    const { mask, method } = detectBackground(withSoftAlpha(sharp, 3))
    expect(method).toBe('alpha')
    expect(mismatchesAwayFromEdges(sharp, mask, (p) => is(sharp, p, FIXTURE.dark))).toBe(0)
  })

  it('removes the colour touching the edges when there is no transparency', () => {
    const img = circle(200)
    const { mask, method } = detectBackground(img)
    expect(method).toBe('edge-colour')
    expect(mismatchesAwayFromEdges(img, mask, (p) => is(img, p, FIXTURE.white))).toBe(0)
  })

  it('keeps white art enclosed by an outline (only white connected to the edge is background)', () => {
    const img = thinOutline(200, 3)
    const { mask } = detectBackground(img)
    const c = Math.floor(200 / 2) + 0.5
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c)
        if (d < 0.35 * 200 - 3) expect(mask[y * 200 + x]).toBe(0) // inside the ring: art
        if (d > 0.35 * 200 + 3) expect(mask[y * 200 + x]).toBe(1) // outside: background
      }
    }
  })

  it('reaches background enclosed by the art only through gaps (the Triforce hole is connected)', () => {
    const img = triforce(200)
    const { mask, method } = detectBackground(img)
    expect(method).toBe('edge-colour')
    expect(mismatchesAwayFromEdges(img, mask, (p) => is(img, p, FIXTURE.dark))).toBe(0)
  })

  it('copes with JPEG noise in the background', () => {
    const clean = circle(200)
    const { mask, method } = detectBackground(withJpegNoise(clean, 8, 2))
    expect(method).toBe('edge-colour')
    let right = 0
    for (let p = 0; p < 200 * 200; p++) if ((mask[p] === 1) === is(clean, p, FIXTURE.white)) right++
    expect(right / (200 * 200)).toBeGreaterThan(0.99)
  })

  it('finds no background when no colour dominates the border', () => {
    const { mask, method } = detectBackground(sixColours(150))
    expect(method).toBe('none')
    expect(mask.every((v) => v === 0)).toBe(true)
  })

  it('finds no background in an image of one colour (it would remove everything)', () => {
    const data = new Uint8ClampedArray(50 * 50 * 4)
    for (let p = 0; p < 2500; p++) data.set([200, 30, 30, 255], p * 4)
    const { mask, method } = detectBackground({ width: 50, height: 50, data })
    expect(method).toBe('none')
    expect(mask.every((v) => v === 0)).toBe(true)
  })
})
