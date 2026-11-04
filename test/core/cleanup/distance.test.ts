import { describe, expect, it } from 'vitest'
import { distanceTransform } from '../../../src/core/cleanup/distance'
import { seededRandom } from '../../../src/core/random'

/** Straightforward but slow: check every outside pixel for every pixel. */
function bruteForce(mask: Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) {
    if (!mask[p]) continue
    let best = Infinity
    for (let q = 0; q < w * h; q++) {
      if (mask[q]) continue
      best = Math.min(best, Math.hypot((p % w) - (q % w), Math.floor(p / w) - Math.floor(q / w)))
    }
    out[p] = best
  }
  return out
}

describe('distanceTransform', () => {
  it('is 0 outside the mask and the distance to the nearest outside pixel inside', () => {
    // 5 × 5 inside, one outside pixel in the middle.
    const mask = new Uint8Array(25).fill(1)
    mask[12] = 0
    const d = distanceTransform(mask, 5, 5)
    expect(d[12]).toBe(0)
    expect(d[13]).toBe(1) // right neighbour
    expect(d[0]).toBeCloseTo(Math.hypot(2, 2), 6) // corner
  })

  it('matches the brute-force answer exactly on a random mask', () => {
    const w = 40
    const h = 30
    const random = seededRandom(5)
    const mask = Uint8Array.from({ length: w * h }, () => (random() < 0.9 ? 1 : 0))
    const fast = distanceTransform(mask, w, h)
    const slow = bruteForce(mask, w, h)
    for (let p = 0; p < w * h; p++) expect(fast[p]).toBeCloseTo(slow[p], 5)
  })

  it('measures a line: the middle of a 5-pixel-wide band is 3 from the outside', () => {
    const w = 20
    const h = 9
    const mask = new Uint8Array(w * h)
    for (let y = 2; y <= 6; y++) for (let x = 0; x < w; x++) mask[y * w + x] = 1
    const d = distanceTransform(mask, w, h)
    expect(d[4 * w + 10]).toBe(3)
    expect(d[2 * w + 10]).toBe(1)
  })

  it('gives Infinity where there is no outside pixel at all', () => {
    expect(Array.from(distanceTransform(new Uint8Array(4).fill(1), 2, 2))).toEqual([
      Infinity,
      Infinity,
      Infinity,
      Infinity,
    ])
  })

  it('is fast enough for a 2 × 1.5 m rug', () => {
    const w = 2000
    const h = 1500
    const mask = new Uint8Array(w * h).fill(1)
    mask[0] = 0
    const t = performance.now()
    distanceTransform(mask, w, h)
    expect(performance.now() - t).toBeLessThan(1500)
  })
})
