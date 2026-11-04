import { describe, expect, it } from 'vitest'
import { MAX_SIDE_PX, capSize } from '../../../src/core/image/capSize'

describe('capSize', () => {
  it('shrinks a huge landscape photo to 4096 on its long side', () => {
    expect(capSize(8000, 6000)).toEqual({ width: 4096, height: 3072, downscaled: true })
  })

  it('shrinks a portrait photo by its height', () => {
    expect(capSize(6000, 8000)).toEqual({ width: 3072, height: 4096, downscaled: true })
  })

  it('leaves small images unchanged', () => {
    expect(capSize(800, 600)).toEqual({ width: 800, height: 600, downscaled: false })
  })

  it('leaves an image exactly at the limit unchanged', () => {
    expect(capSize(MAX_SIDE_PX, 100)).toEqual({
      width: MAX_SIDE_PX,
      height: 100,
      downscaled: false,
    })
  })

  it('rounds to whole pixels and keeps the aspect ratio within one pixel', () => {
    const { width, height } = capSize(5000, 3333)
    expect(width).toBe(4096)
    expect(Number.isInteger(height)).toBe(true)
    expect(Math.abs(height - (3333 * 4096) / 5000)).toBeLessThanOrEqual(0.5)
  })

  it('never shrinks a side below 1 pixel', () => {
    expect(capSize(100_000, 10)).toEqual({ width: 4096, height: 1, downscaled: true })
  })

  it('accepts a different limit', () => {
    expect(capSize(1000, 500, 100)).toEqual({ width: 100, height: 50, downscaled: true })
  })

  it.each([
    [0, 100],
    [100, -1],
    [Number.NaN, 100],
    [100, Infinity],
  ])('rejects an impossible size %d × %d', (w, h) => {
    expect(() => capSize(w, h)).toThrow()
  })
})
