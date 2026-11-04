import { describe, expect, it } from 'vitest'
import { calibrationFactor, projectorTransform } from '../../src/render/projector/transform'

const base = {
  rug: { widthMm: 1000, heightMm: 600 },
  viewport: { w: 1920, h: 1080 },
  pxPerMm: 1.5,
  calibrationFactor: 1,
  offsetPx: { x: 0, y: 0 },
  mirror: false,
}

describe('calibrationFactor', () => {
  it('turns "I measured 96 mm" for a 100 mm bar into a factor of 100/96', () => {
    expect(calibrationFactor(100, 96)).toBeCloseTo(100 / 96, 12)
  })

  it('is 1 when the bar measures exactly right', () => {
    expect(calibrationFactor(100, 100)).toBe(1)
  })

  it('rejects measurements that are not a positive number', () => {
    expect(() => calibrationFactor(100, 0)).toThrow()
    expect(() => calibrationFactor(100, -5)).toThrow()
    expect(() => calibrationFactor(100, Number.NaN)).toThrow()
  })
})

describe('projectorTransform', () => {
  it('centres the rug on the screen', () => {
    const t = projectorTransform(base)
    expect(t.toScreen({ x: 500, y: 300 })).toEqual({ x: 960, y: 540 })
  })

  it('draws 100 mm as 100 × pxPerMm × factor screen pixels', () => {
    const t = projectorTransform({ ...base, calibrationFactor: 100 / 96 })
    const a = t.toScreen({ x: 0, y: 0 })
    const b = t.toScreen({ x: 100, y: 0 })
    expect(b.x - a.x).toBeCloseTo(100 * 1.5 * (100 / 96), 9)
    expect(t.scale).toBeCloseTo(1.5 * (100 / 96), 12)
  })

  it('makes a bar that measured 96 mm measure 100 mm after calibrating', () => {
    // The real projector puts 150 / 96 screen pixels on each mm of cloth (we guessed 1.5).
    const clothMm = (screenPx: number) => screenPx / (150 / 96)
    const bar = (t: ReturnType<typeof projectorTransform>) =>
      t.toScreen({ x: 100, y: 0 }).x - t.toScreen({ x: 0, y: 0 }).x
    expect(clothMm(bar(projectorTransform(base)))).toBeCloseTo(96, 9)
    const calibrated = projectorTransform({
      ...base,
      calibrationFactor: calibrationFactor(100, 96),
    })
    expect(clothMm(bar(calibrated))).toBeCloseTo(100, 9)
  })

  it('mirrors left and right: the rug’s left edge goes where the right edge was', () => {
    const plain = projectorTransform(base)
    const mirrored = projectorTransform({ ...base, mirror: true })
    expect(mirrored.toScreen({ x: 0, y: 120 })).toEqual(plain.toScreen({ x: 1000, y: 120 }))
    expect(mirrored.toScreen({ x: 1000, y: 120 })).toEqual(plain.toScreen({ x: 0, y: 120 }))
    expect(mirrored.toScreen({ x: 300, y: 50 }).y).toBe(plain.toScreen({ x: 300, y: 50 }).y)
  })

  it('moves every point by exactly the offset', () => {
    const plain = projectorTransform(base)
    const moved = projectorTransform({ ...base, offsetPx: { x: 12, y: -7 } })
    for (const p of [
      { x: 0, y: 0 },
      { x: 1000, y: 600 },
      { x: 333, y: 77 },
    ]) {
      const a = plain.toScreen(p)
      const b = moved.toScreen(p)
      expect(b.x - a.x).toBeCloseTo(12, 9)
      expect(b.y - a.y).toBeCloseTo(-7, 9)
    }
  })

  it('goes back from screen to rug (also mirrored, calibrated and moved)', () => {
    const t = projectorTransform({
      ...base,
      mirror: true,
      calibrationFactor: 1.07,
      offsetPx: { x: 5, y: 9 },
    })
    for (const p of [
      { x: 0, y: 0 },
      { x: 812.5, y: 410 },
    ]) {
      const back = t.toRug(t.toScreen(p))
      expect(back.x).toBeCloseTo(p.x, 9)
      expect(back.y).toBeCloseTo(p.y, 9)
    }
  })
})
