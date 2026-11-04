import { describe, expect, it } from 'vitest'
import type { ImageGrid, RGB } from '../../src/core/types'
import {
  CIRCLE_RADIUS_SHARE,
  FIXTURE,
  circle,
  gradientCircle,
  sixColours,
  smallEye,
  thinOutline,
  triforce,
  withJpegNoise,
  withSoftAlpha,
} from './images'
import { seededRandom } from '../../src/core/random'

// --- small helpers for looking at images ---

const key = (d: Uint8ClampedArray, i: number) => `${d[i]},${d[i + 1]},${d[i + 2]}`

function distinctColours(img: ImageGrid): Set<string> {
  const seen = new Set<string>()
  for (let i = 0; i < img.data.length; i += 4) seen.add(key(img.data, i))
  return seen
}

function countPixels(img: ImageGrid, c: RGB): number {
  let n = 0
  for (let i = 0; i < img.data.length; i += 4) if (key(img.data, i) === `${c.r},${c.g},${c.b}`) n++
  return n
}

/** Number of separate 4-connected patches of colour `c`. */
function countPatches(img: ImageGrid, c: RGB): number {
  const { width: w, height: h } = img
  const want = `${c.r},${c.g},${c.b}`
  const seen = new Uint8Array(w * h)
  let patches = 0
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || key(img.data, start * 4) !== want) continue
    patches++
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w
      const y = (p - x) / w
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const q = ny * w + nx
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[q]) continue
        if (key(img.data, q * 4) !== want) continue
        seen[q] = 1
        stack.push(q)
      }
    }
  }
  return patches
}

const alphaAt = (img: ImageGrid, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]

// --- tests ---

describe('seededRandom', () => {
  it('gives the same sequence for the same seed', () => {
    const a = seededRandom(7)
    const b = seededRandom(7)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('gives a different sequence for a different seed', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)())
  })

  it('stays within [0, 1)', () => {
    const random = seededRandom(3)
    for (let i = 0; i < 10_000; i++) {
      const v = random()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('triforce', () => {
  it('has exactly 2 colours', () => {
    expect(distinctColours(triforce(300))).toEqual(
      new Set([
        `${FIXTURE.gold.r},${FIXTURE.gold.g},${FIXTURE.gold.b}`,
        `${FIXTURE.dark.r},${FIXTURE.dark.g},${FIXTURE.dark.b}`,
      ]),
    )
  })

  it.each([100, 301, 800])('has 3 separate gold triangles and 1 background at %i px', (size) => {
    const img = triforce(size)
    expect(countPatches(img, FIXTURE.gold)).toBe(3)
    expect(countPatches(img, FIXTURE.dark)).toBe(1)
  })
})

describe('circle', () => {
  it('covers πr² within 1%', () => {
    const img = circle(1000)
    const r = CIRCLE_RADIUS_SHARE * 1000
    const expected = Math.PI * r * r
    expect(Math.abs(countPixels(img, FIXTURE.red) - expected) / expected).toBeLessThan(0.01)
  })
})

describe('gradientCircle', () => {
  it('has one colour per step plus the background', () => {
    expect(distinctColours(gradientCircle(400, 8)).size).toBe(9)
  })
})

describe('thinOutline', () => {
  it.each([1, 2, 5])('draws the ring exactly %i px wide across the middle row', (width) => {
    const size = 200
    const img = thinOutline(size, width)
    const row = Math.floor(size / 2)
    let black = 0
    for (let x = 0; x < size / 2; x++) {
      if (key(img.data, (row * size + x) * 4) === '0,0,0') black++
    }
    expect(black).toBe(width)
  })

  it('has black ring, red dot and white, and nothing else', () => {
    expect(distinctColours(thinOutline(200, 3)).size).toBe(3)
  })
})

describe('smallEye', () => {
  it('makes the eye the requested share of the image, within 10%', () => {
    const size = 600
    const share = countPixels(smallEye(size, 0.005), FIXTURE.navy) / (size * size)
    expect(share).toBeGreaterThan(0.005 * 0.9)
    expect(share).toBeLessThan(0.005 * 1.1)
  })
})

describe('sixColours', () => {
  it('has exactly 6 colours', () => {
    expect(distinctColours(sixColours(300)).size).toBe(6)
  })
})

describe('withJpegNoise', () => {
  it('changes no channel by more than the amplitude, and leaves alpha alone', () => {
    const img = triforce(200)
    const noisy = withJpegNoise(img, 6, 1)
    let changed = 0
    for (let i = 0; i < img.data.length; i++) {
      const diff = Math.abs(noisy.data[i] - img.data[i])
      if (i % 4 === 3) expect(diff).toBe(0)
      else expect(diff).toBeLessThanOrEqual(6)
      if (diff > 0) changed++
    }
    expect(changed).toBeGreaterThan(img.data.length / 2)
  })

  it('gives the same noise for the same seed', () => {
    const img = triforce(100)
    expect(withJpegNoise(img, 6, 5).data).toEqual(withJpegNoise(img, 6, 5).data)
  })

  it('does not change the input', () => {
    const img = triforce(100)
    const before = new Uint8ClampedArray(img.data)
    withJpegNoise(img, 6, 1)
    expect(img.data).toEqual(before)
  })
})

describe('withSoftAlpha', () => {
  const size = 200
  const soft = withSoftAlpha(circle(size), 3)
  const row = Math.floor(size / 2)
  const r = CIRCLE_RADIUS_SHARE * size
  const edgeX = Math.round(size / 2 - r) // the circle's left edge on the middle row

  it('produces alpha strictly between 0 and 255 at the edge', () => {
    const partial = []
    for (let x = edgeX - 4; x <= edgeX + 4; x++) {
      const a = alphaAt(soft, x, row)
      if (a > 0 && a < 255) partial.push(a)
    }
    expect(partial.length).toBeGreaterThanOrEqual(4)
  })

  it('is fully transparent far outside and fully opaque far inside', () => {
    expect(alphaAt(soft, 2, 2)).toBe(0)
    expect(alphaAt(soft, row, row)).toBe(255)
  })

  it('keeps the shape: alpha ≥ 128 exactly where the circle was', () => {
    const original = circle(size)
    for (let p = 0; p < size * size; p++) {
      const wasArt = key(original.data, p * 4) !== '255,255,255'
      expect(soft.data[p * 4 + 3] >= 128).toBe(wasArt)
    }
  })

  it('gives semi-transparent pixels the art colour, never the background', () => {
    for (let p = 0; p < size * size; p++) {
      const a = soft.data[p * 4 + 3]
      if (a > 0)
        expect(key(soft.data, p * 4)).toBe(`${FIXTURE.red.r},${FIXTURE.red.g},${FIXTURE.red.b}`)
    }
  })

  it('does not change the input', () => {
    const img = circle(100)
    const before = new Uint8ClampedArray(img.data)
    withSoftAlpha(img, 3)
    expect(img.data).toEqual(before)
  })
})
