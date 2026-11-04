import { describe, expect, it } from 'vitest'
import { calibrationLayout } from '../../src/render/projector/calibration'
import { projectorTransform } from '../../src/render/projector/transform'

function layoutFor(
  rug: { widthMm: number; heightMm: number },
  viewport = { w: 1920, h: 1080 },
  mirror = false,
) {
  const t = projectorTransform({
    rug,
    viewport,
    pxPerMm: 1,
    calibrationFactor: 1,
    offsetPx: { x: 0, y: 0 },
    mirror,
  })
  return { layout: calibrationLayout(rug, t.toScreen, t.scale, viewport), t }
}

const overlaps = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('calibrationLayout', () => {
  it('frames the rug exactly, with a crosshair at each corner', () => {
    const { layout, t } = layoutFor({ widthMm: 800, heightMm: 600 })
    const tl = t.toScreen({ x: 0, y: 0 })
    expect(layout.frame).toEqual({ x: tl.x, y: tl.y, w: 800, h: 600 })
    expect(layout.crosshairs).toHaveLength(4)
  })

  it('draws the bar exactly 100 mm long and the square 100 × 100 mm, at the current scale', () => {
    const rug = { widthMm: 800, heightMm: 600 }
    const viewport = { w: 1920, h: 1080 }
    const t = projectorTransform({
      rug,
      viewport,
      pxPerMm: 1.2,
      calibrationFactor: 1.05,
      offsetPx: { x: 0, y: 0 },
      mirror: false,
    })
    const layout = calibrationLayout(rug, t.toScreen, t.scale, viewport)
    expect(
      Math.hypot(layout.bar.to.x - layout.bar.from.x, layout.bar.to.y - layout.bar.from.y),
    ).toBeCloseTo(100 * 1.2 * 1.05, 9)
    expect(layout.square.size).toBeCloseTo(100 * 1.2 * 1.05, 9)
  })

  it('puts bar and square outside the rug, on the screen', () => {
    const { layout } = layoutFor({ widthMm: 800, heightMm: 600 })
    const barBox = {
      x: Math.min(layout.bar.from.x, layout.bar.to.x),
      y: layout.bar.from.y - 5,
      w: 100,
      h: 10,
    }
    const squareBox = {
      x: layout.square.x,
      y: layout.square.y,
      w: layout.square.size,
      h: layout.square.size,
    }
    for (const box of [barBox, squareBox]) {
      expect(overlaps(box, layout.frame)).toBe(false)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.w).toBeLessThanOrEqual(1920)
      expect(box.y + box.h).toBeLessThanOrEqual(1080)
    }
    expect(overlaps(barBox, squareBox)).toBe(false)
  })

  it('moves them beside the rug when there is no room below or above', () => {
    const { layout } = layoutFor({ widthMm: 900, heightMm: 1000 })
    const squareBox = {
      x: layout.square.x,
      y: layout.square.y,
      w: layout.square.size,
      h: layout.square.size,
    }
    expect(overlaps(squareBox, layout.frame)).toBe(false)
    expect(squareBox.x + squareBox.w).toBeLessThanOrEqual(1920)
  })

  it('keeps the bar horizontal and readable when the rug is mirrored', () => {
    const { layout } = layoutFor({ widthMm: 800, heightMm: 600 }, undefined, true)
    expect(layout.bar.from.y).toBe(layout.bar.to.y)
    expect(layout.bar.to.x).toBeGreaterThan(layout.bar.from.x)
  })
})
