import { describe, expect, it } from 'vitest'
import { fitEdge } from '../../../src/core/trace/fit'
import { FIXTURE, CIRCLE_RADIUS_SHARE, circle, triforce } from '../../fixtures/images'
import { loopsOf, samplePath, segDirections, staircase, turnDeg, twoColourMap } from './helpers'

const OPTS = { toleranceMm: 1, cornerAngleDeg: 60 }

describe('fitEdge', () => {
  it('turns each Triforce triangle into 3 straight lines with sharp 120° turns', () => {
    for (const loop of loopsOf(twoColourMap(triforce(300), FIXTURE.gold))) {
      const { start, segs } = fitEdge(loop, OPTS)
      expect(segs.map((s) => s.kind)).toEqual(['line', 'line', 'line'])
      expect(segs[2].to).toEqual(start) // closes
      let from = start
      const dirs = segs.map((s) => {
        const d = segDirections(from, s).out
        from = s.to
        return d
      })
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(turnDeg(dirs[i], dirs[(i + 1) % 3]) - 120)).toBeLessThan(5)
      }
    }
  })

  it('follows the whole traced border of each Triforce triangle', () => {
    for (const loop of loopsOf(twoColourMap(triforce(300), FIXTURE.gold))) {
      const { start, segs } = fitEdge(loop, OPTS)
      // Densely sampled straight sides: points every 0.1 mm.
      const path: { x: number; y: number }[] = []
      let from = start
      for (const s of segs) {
        const len = Math.hypot(s.to.x - from.x, s.to.y - from.y)
        for (let i = 0; i <= len * 10; i++) {
          const t = i / (len * 10)
          path.push({ x: from.x + t * (s.to.x - from.x), y: from.y + t * (s.to.y - from.y) })
        }
        from = s.to
      }
      for (const p of loop) {
        const nearest = Math.min(...path.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))
        expect(nearest).toBeLessThan(1.1 + Math.SQRT1_2)
      }
    }
  })

  it('turns a 45° pixel staircase into one straight line', () => {
    const pts = staircase('RD', 40)
    const { start, segs } = fitEdge(pts, OPTS)
    expect(start).toEqual(pts[0])
    expect(segs).toEqual([{ kind: 'line', to: pts[pts.length - 1] }])
  })

  it.each(['RRRD', 'DDDDR', 'RDRDD'])('turns a %s staircase into one straight line', (pattern) => {
    const segs = fitEdge(staircase(pattern, 20), OPTS).segs
    expect(segs.map((s) => s.kind)).toEqual(['line'])
  })

  it('keeps a circle round: within 1 mm of the true circle, no stair steps, no kinks', () => {
    const size = 250
    const r = CIRCLE_RADIUS_SHARE * size // 100 mm at 1 mm per pixel
    const c = Math.floor(size / 2) + 0.5
    const [loop] = loopsOf(twoColourMap(circle(size), FIXTURE.red))
    const { start, segs } = fitEdge(loop, OPTS)
    expect(segs.every((s) => s.kind === 'cubic')).toBe(true)
    expect(segs.length).toBeLessThan(20) // a few smooth curves, not hundreds of steps
    for (const p of samplePath(start, segs)) {
      expect(Math.abs(Math.hypot(p.x - c, p.y - c) - r)).toBeLessThan(1)
    }
    // Turns between neighbouring curves, including where the loop closes.
    let from = start
    const dirs = segs.map((s) => {
      const d = segDirections(from, s)
      from = s.to
      return d
    })
    for (let i = 0; i < dirs.length; i++) {
      expect(turnDeg(dirs[i].in, dirs[(i + 1) % dirs.length].out)).toBeLessThan(15)
    }
  })

  it('keeps the exact end points of an open edge (where it meets other borders)', () => {
    const pts = staircase('RRD', 15, { x: 5, y: 7 })
    const { start, segs } = fitEdge(pts, OPTS)
    expect(start).toEqual(pts[0])
    expect(segs[segs.length - 1].to).toEqual(pts[pts.length - 1])
  })

  it('stays within the tolerance of the traced border everywhere', () => {
    const [loop] = loopsOf(twoColourMap(circle(250), FIXTURE.red))
    const { start, segs } = fitEdge(loop, OPTS)
    const path = samplePath(start, segs, 1000) // dense: curves can be long
    const nearest = (p: { x: number; y: number }) =>
      Math.min(...path.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))
    // Midpoints of the pixel sides (what is fitted): within the tolerance (plus a hair for
    // the gaps between sampled path points).
    for (let i = 0; i + 1 < loop.length; i++) {
      const mid = { x: (loop[i].x + loop[i + 1].x) / 2, y: (loop[i].y + loop[i + 1].y) / 2 }
      expect(nearest(mid)).toBeLessThan(1.1)
    }
    // Pixel corners stick out up to half a pixel diagonal (0.71) beyond that, by design.
    for (const p of loop) expect(nearest(p)).toBeLessThan(1.1 + Math.SQRT1_2)
  })

  it('fits a short edge of two points as a line', () => {
    expect(
      fitEdge(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        OPTS,
      ).segs,
    ).toEqual([{ kind: 'line', to: { x: 1, y: 0 } }])
  })
})
