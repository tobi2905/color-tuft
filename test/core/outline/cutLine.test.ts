import { describe, expect, it } from 'vitest'
import { signedArea } from '../../../src/core/geometry'
import { type CutLoop, cutLine, cutRug, cutSize } from '../../../src/core/outline/cutLine'
import type { Pt } from '../../../src/core/types'

/** A loop as a dense polygon (curves sampled). */
function polygon(loop: CutLoop): Pt[] {
  const out = [loop.start]
  let from = loop.start
  for (const s of loop.segs) {
    if (s.kind === 'line') out.push(s.to)
    else {
      for (let i = 1; i <= 16; i++) {
        const t = i / 16
        const u = 1 - t
        out.push({
          x:
            u * u * u * from.x +
            3 * u * u * t * s.c1.x +
            3 * u * t * t * s.c2.x +
            t * t * t * s.to.x,
          y:
            u * u * u * from.y +
            3 * u * u * t * s.c1.y +
            3 * u * t * t * s.c2.y +
            t * t * t * s.to.y,
        })
      }
    }
    from = s.to
  }
  return out
}

/** Even–odd inside test over all loops. */
function inside(p: Pt, loops: CutLoop[]): boolean {
  let hit = false
  for (const poly of loops.map(polygon)) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]
      const b = poly[j]
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
        hit = !hit
    }
  }
  return hit
}

/** Total area enclosed by the loops (outer minus holes). */
const area = (loops: CutLoop[]) =>
  Math.abs(loops.reduce((sum, l) => sum + signedArea(polygon(l)), 0))

/** A w × h art mask with rectangles of art: [x0, y0, x1, y1) in pixels. */
function artMask(w: number, h: number, ...rects: [number, number, number, number][]): Uint8Array {
  const art = new Uint8Array(w * h)
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) art[y * w + x] = 1
  }
  return art
}

describe('cutLine', () => {
  it('grows a 200 mm square by 20 mm into a square with rounded corners', () => {
    const art = artMask(240, 240, [20, 20, 220, 220])
    const loops = cutLine(art, 240, 240, 1, { offsetMm: 20, smoothMm: 0 })
    expect(loops).toHaveLength(1)
    const expected = 200 * 200 + 4 * 200 * 20 + Math.PI * 20 * 20
    expect(Math.abs(area(loops) - expected) / expected).toBeLessThan(0.02)
  })

  it('reaches beyond the grid when the art touches its edge (nothing is cut off)', () => {
    const art = artMask(100, 100, [0, 0, 100, 100])
    const loops = cutLine(art, 100, 100, 1, { offsetMm: 10, smoothMm: 0 })
    expect(inside({ x: -5, y: 50 }, loops)).toBe(true)
    expect(inside({ x: 105, y: 50 }, loops)).toBe(true)
  })

  it('closes a 10 mm notch at 8 mm smoothing, but not at 4 mm', () => {
    // A 200 mm square with a 10 mm wide, 60 mm deep notch from the top.
    const art = artMask(240, 240, [20, 20, 115, 220], [125, 20, 220, 220], [115, 80, 125, 220])
    const notch = { x: 120, y: 40 }
    expect(inside(notch, cutLine(art, 240, 240, 1, { offsetMm: 0, smoothMm: 8 }))).toBe(true)
    expect(inside(notch, cutLine(art, 240, 240, 1, { offsetMm: 0, smoothMm: 4 }))).toBe(false)
  })

  it('does not make the rug bigger by smoothing: a square keeps its size', () => {
    const art = artMask(240, 240, [20, 20, 220, 220])
    const loops = cutLine(art, 240, 240, 1, { offsetMm: 0, smoothMm: 10 })
    expect(Math.abs(area(loops) - 200 * 200) / (200 * 200)).toBeLessThan(0.02)
  })

  it('follows the art closely with no offset and no smoothing', () => {
    const art = artMask(120, 120, [10, 10, 110, 110])
    const loops = cutLine(art, 120, 120, 1, { offsetMm: 0, smoothMm: 0 })
    expect(Math.abs(area(loops) - 100 * 100) / (100 * 100)).toBeLessThan(0.02)
  })

  it('works in mm: the same art at 2 mm per pixel gives a loop twice as wide', () => {
    const art = artMask(120, 120, [10, 10, 110, 110])
    const loops = cutLine(art, 120, 120, 2, { offsetMm: 0, smoothMm: 0 })
    expect(Math.abs(area(loops) - 200 * 200) / (200 * 200)).toBeLessThan(0.02)
  })

  it('gives one loop per separate piece of art', () => {
    const art = artMask(300, 120, [10, 10, 110, 110], [190, 10, 290, 110])
    expect(cutLine(art, 300, 120, 1, { offsetMm: 10, smoothMm: 2 })).toHaveLength(2)
  })

  it('merges pieces closer than twice the offset into one rug', () => {
    const art = artMask(300, 120, [10, 10, 140, 110], [160, 10, 290, 110]) // 20 mm apart
    expect(cutLine(art, 300, 120, 1, { offsetMm: 15, smoothMm: 2 })).toHaveLength(1)
  })

  it('keeps a big hole in ring-shaped art as its own loop, going round the other way', () => {
    const art = artMask(
      300,
      300,
      [20, 20, 280, 70],
      [20, 230, 280, 280],
      [20, 70, 70, 230],
      [230, 70, 280, 230],
    )
    const loops = cutLine(art, 300, 300, 1, { offsetMm: 5, smoothMm: 2 })
    expect(loops).toHaveLength(2)
    const signs = loops.map((l) => Math.sign(signedArea(polygon(l))))
    expect(signs[0]).toBe(-signs[1])
    expect(inside({ x: 150, y: 150 }, loops)).toBe(false) // the hole is not rug
  })

  it('closes every loop', () => {
    const art = artMask(240, 240, [20, 20, 115, 220], [125, 20, 220, 220], [115, 80, 125, 220])
    for (const loop of cutLine(art, 240, 240, 1, { offsetMm: 10, smoothMm: 3 })) {
      const end = loop.segs[loop.segs.length - 1].to
      expect(Math.hypot(end.x - loop.start.x, end.y - loop.start.y)).toBeLessThan(1e-9)
    }
  })

  it('returns no loops for empty art', () => {
    expect(cutLine(new Uint8Array(100), 10, 10, 1, { offsetMm: 5, smoothMm: 2 })).toEqual([])
  })
})

describe('cutRug', () => {
  it('gives the same loops as cutLine plus the rug as a mask on the same grid', () => {
    const art = artMask(140, 140, [20, 20, 120, 120])
    const { loops, mask } = cutRug(art, 140, 140, 1, { offsetMm: 10, smoothMm: 0 })
    expect(loops).toEqual(cutLine(art, 140, 140, 1, { offsetMm: 10, smoothMm: 0 }))
    expect(mask[70 * 140 + 70]).toBe(1) // the art
    expect(mask[70 * 140 + 15]).toBe(1) // 5 mm outside the art: the border band
    expect(mask[70 * 140 + 5]).toBe(0) // 15 mm outside: beyond the cut
  })
})

describe('cutSize', () => {
  it('measures the finished rug: a 200 mm square with a 20 mm border is about 240 mm wide', () => {
    const art = artMask(260, 260, [30, 30, 230, 230])
    const size = cutSize(cutLine(art, 260, 260, 1, { offsetMm: 20, smoothMm: 0 }))!
    expect(Math.abs(size.widthMm - 240)).toBeLessThan(2)
    expect(Math.abs(size.heightMm - 240)).toBeLessThan(2)
  })

  it('covers all pieces of the rug', () => {
    const art = artMask(300, 120, [10, 10, 110, 110], [190, 10, 290, 110])
    const size = cutSize(cutLine(art, 300, 120, 1, { offsetMm: 5, smoothMm: 0 }))!
    expect(Math.abs(size.widthMm - 290)).toBeLessThan(2)
  })

  it('is null without a cut line', () => {
    expect(cutSize([])).toBeNull()
  })
})
