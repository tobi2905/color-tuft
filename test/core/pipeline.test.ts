import { describe, expect, it } from 'vitest'
import { connectedRegions } from '../../src/core/cleanup/regions'
import { srgbToOklab } from '../../src/core/color/convert'
import { deltaE } from '../../src/core/color/distance'
import {
  type PipelineInput,
  createCachedPipeline,
  finishPipeline,
  prepareImage,
  runPipeline,
} from '../../src/core/pipeline'
import { NO_LABEL, type OKLab } from '../../src/core/types'
import {
  FIXTURE,
  circle,
  smallEye,
  thinOutline,
  triforce,
  withJpegNoise,
  withSoftAlpha,
} from '../fixtures/images'

const base = (overrides: Partial<PipelineInput> = {}): PipelineInput => ({
  image: triforce(400),
  rug: { widthMm: 800, heightMm: 800 },
  count: 2,
  locked: [],
  minDetailMm: 10,
  outlines: null,
  thicken: [],
  merges: [],
  shape: 'rectangle',
  offsetMm: 0,
  smoothMm: 0,
  backgroundEdits: [],
  borderColour: null,
  backgroundColour: null,
  seed: 1,
  ...overrides,
})

const closest = (palette: OKLab[], c: OKLab) => Math.min(...palette.map((p) => deltaE(p, c)))
const goldLab = srgbToOklab(FIXTURE.gold)
const goldLabel = (palette: OKLab[]) => palette.findIndex((p) => deltaE(p, goldLab) < 2)

describe('runPipeline', () => {
  it('turns the Triforce on an 800 × 800 mm rug into 2 colours and 3 straight-sided gold triangles', () => {
    const result = runPipeline(base())
    expect(result.palette).toHaveLength(2)
    expect(result.suggestedCount).toBe(2)
    const gold = goldLabel(result.palette)
    const triangles = result.pattern.regions.filter((r) => r.label === gold)
    expect(triangles).toHaveLength(3)
    for (const t of triangles) {
      const segs = t.rings[0].flatMap((ref) => result.pattern.edges[ref.edgeId].segs)
      expect(segs.map((s) => s.kind)).toEqual(['line', 'line', 'line'])
    }
    expect(result.thin).toEqual([])
  })

  it('runs the Triforce on an 800 × 800 mm rug in under a second', () => {
    // One warm-up run (JavaScript compiles hot code on first use), then the best of three:
    // other test files run in parallel and can slow a single run down.
    runPipeline(base())
    let best = Infinity
    for (let i = 0; i < 3; i++) {
      const t = performance.now()
      runPipeline(base())
      best = Math.min(best, performance.now() - t)
    }
    expect(best).toBeLessThan(1000)
  }, 30_000)

  it('works at real scale: a 1 mm per pixel map the size of the rug', () => {
    const { map, pattern } = runPipeline(base())
    expect([map.width, map.height, map.mmPerPx]).toEqual([800, 800, 1])
    expect(pattern.rug).toEqual({ widthMm: 800, heightMm: 800 })
  })

  it('cleans a noisy JPEG down to the same 2 colours and 3 triangles', () => {
    const result = runPipeline(base({ image: withJpegNoise(triforce(400), 12, 2) }))
    expect(result.palette).toHaveLength(2)
    expect(
      result.pattern.regions.filter((r) => r.label === goldLabel(result.palette)),
    ).toHaveLength(3)
  })

  it('keeps a transparent PNG background outside the rug, with no halo colour', () => {
    const result = runPipeline(
      base({ image: withSoftAlpha(triforce(400), 3), count: 4, shape: 'shaped' }),
    )
    expect(result.palette).toHaveLength(1)
    expect(closest(result.palette, goldLab)).toBeLessThan(2)
    expect(result.map.labels.filter((l) => l === NO_LABEL).length).toBeGreaterThan(0)
  })

  it('keeps a small but distinct eye', () => {
    const result = runPipeline(base({ image: smallEye(400, 0.005), count: 3 }))
    expect(closest(result.palette, srgbToOklab(FIXTURE.navy))).toBeLessThan(2)
  })

  it('leaves no patch smaller than the minimum detail (10 × 10 mm)', () => {
    const { map } = runPipeline(base({ image: withJpegNoise(triforce(400), 40, 3) }))
    for (const r of connectedRegions(map).regions)
      expect(r.areaPx * map.mmPerPx ** 2).toBeGreaterThanOrEqual(100)
  })

  it('uses the suggested count when count is null', () => {
    const result = runPipeline(base({ image: smallEye(400, 0.005), count: null }))
    expect(result.suggestedCount).toBe(3)
    expect(result.palette).toHaveLength(3)
  })

  it('returns a locked colour exactly', () => {
    const red = srgbToOklab(FIXTURE.red)
    expect(runPipeline(base({ locked: [red], count: 3 })).palette).toContainEqual(red)
  })

  it('counts merged colours correctly when outlines add a colour too', () => {
    const lineArt = base({ image: thinOutline(400, 6), count: 3, minDetailMm: 4 })
    const before = runPipeline(lineArt)
    const red = before.palette.find((p) => deltaE(p, srgbToOklab(FIXTURE.red)) < 3)!
    const white = before.palette.find((p) => p.L > 0.9)!
    const blue = srgbToOklab(FIXTURE.blue)
    const after = runPipeline({
      ...lineArt,
      merges: [{ from: red, into: white }],
      outlines: { widthMm: 5, colour: blue, where: 'outer' },
    })
    expect(after.mergedAway).toBe(1)
    expect(after.palette).toHaveLength(3) // white, black, plus the blue outline
  })

  it('adds outlines only when asked, as a new palette colour', () => {
    expect(runPipeline(base()).palette).toHaveLength(2)
    const black = srgbToOklab(FIXTURE.black)
    const result = runPipeline(base({ outlines: { widthMm: 10, colour: black, where: 'all' } }))
    expect(result.palette).toHaveLength(3)
    const outlineLabel = result.palette.findIndex((p) => deltaE(p, black) < 0.01)
    expect(result.map.labels.includes(outlineLabel)).toBe(true)
  })

  it('reuses a palette colour for the outline when it is practically the same', () => {
    const dark = srgbToOklab(FIXTURE.dark)
    const result = runPipeline(base({ outlines: { widthMm: 10, colour: dark, where: 'all' } }))
    expect(result.palette).toHaveLength(2)
  })

  it('suggests outlines for line art, and none for the Triforce', () => {
    expect(runPipeline(base()).outlineSuggestion).toBeNull()
    const lineArt = runPipeline(base({ image: thinOutline(400, 4), count: 3, minDetailMm: 4 }))
    const black = lineArt.palette.findIndex((p) => deltaE(p, srgbToOklab(FIXTURE.black)) < 3)
    expect(lineArt.outlineSuggestion).toBe(black)
  })

  it('warns about lines thinner than the minimum detail', () => {
    // 2 px lines on a 400 px image, enlarged to 800 mm: 4 mm lines, minimum 8 mm.
    const result = runPipeline(base({ image: thinOutline(400, 2), count: 3, minDetailMm: 8 }))
    const black = result.palette.findIndex((p) => deltaE(p, srgbToOklab(FIXTURE.black)) < 3)
    expect(result.thin.some((t) => t.label === black)).toBe(true)
  })

  it('thickens the colours it is told to, so their thin-line warnings go away', () => {
    const black = srgbToOklab(FIXTURE.black)
    const lineArt = base({ image: thinOutline(400, 2), count: 3, minDetailMm: 8 })
    const before = runPipeline(lineArt)
    const blackLabel = before.palette.findIndex((p) => deltaE(p, black) < 3)
    expect(before.thin.some((t) => t.label === blackLabel)).toBe(true)
    const after = runPipeline({ ...lineArt, thicken: [before.palette[blackLabel]] })
    expect(after.thin.some((t) => t.label === blackLabel)).toBe(false)
  })

  it('merges one colour into another and leaves the rest as it was', () => {
    const lineArt = base({ image: thinOutline(400, 6), count: 3, minDetailMm: 4 })
    const before = runPipeline(lineArt)
    const red = before.palette.find((p) => deltaE(p, srgbToOklab(FIXTURE.red)) < 3)!
    const black = before.palette.find((p) => deltaE(p, srgbToOklab(FIXTURE.black)) < 3)!
    const after = runPipeline({ ...lineArt, merges: [{ from: red, into: black }] })
    expect(after.palette).toHaveLength(2)
    expect(after.mergedAway).toBe(1)
    expect(after.palette).toContainEqual(black)
    expect(after.palette.some((p) => deltaE(p, red) < 3)).toBe(false)
    // Nothing else reshuffles: white is exactly the same colour, covering the same area within
    // 1% (cleanup may settle a few edge pixels differently next to the now bigger black).
    const white = before.palette.find((p) => p.L > 0.9)!
    expect(after.palette).toContainEqual(white)
    const area = (r: typeof before, c: typeof white) =>
      r.map.labels.filter((l) => l === r.palette.findIndex((p) => deltaE(p, c) < 1e-9)).length
    expect(Math.abs(area(after, white) - area(before, white)) / area(before, white)).toBeLessThan(
      0.01,
    )
  })

  it('copes with tiny transparent specks inside the art', () => {
    // A transparent PNG with single see-through pixels scattered inside the drawing.
    const img = withSoftAlpha(circle(300), 2)
    for (let i = 0; i < 40; i++) {
      const x = 110 + ((i * 37) % 80)
      const y = 110 + ((i * 53) % 80)
      img.data[(y * 300 + x) * 4 + 3] = 0
    }
    const result = runPipeline(
      base({ image: img, rug: { widthMm: 300, heightMm: 300 }, count: null }),
    )
    expect(result.pattern.regions.length).toBeGreaterThan(0)
  })

  it('gives the same result for the same input', () => {
    const a = runPipeline(base({ image: withJpegNoise(triforce(300), 12, 5) }))
    const b = runPipeline(base({ image: withJpegNoise(triforce(300), 12, 5) }))
    expect(a.palette).toEqual(b.palette)
    expect(a.map.labels).toEqual(b.map.labels)
  })

  it('gives the same result in two parts (image first, then colours) as in one go', () => {
    const input = base({ image: withJpegNoise(triforce(300), 12, 5), count: 3 })
    const whole = runPipeline(input)
    const parts = finishPipeline(prepareImage(input), input)
    expect(parts.palette).toEqual(whole.palette)
    expect(parts.map.labels).toEqual(whole.map.labels)
    expect(parts.suggestedCount).toBe(whole.suggestedCount)
  })
})

describe('createCachedPipeline', () => {
  it('prepares an image once and reuses it while only colour settings change', () => {
    const cached = createCachedPipeline()
    const input = base({ image: triforce(300) })
    cached.run(input, 'image-1|800x800')
    cached.run({ ...input, count: 3 }, 'image-1|800x800')
    cached.run({ ...input, locked: [srgbToOklab(FIXTURE.red)] }, 'image-1|800x800')
    expect(cached.preparedCount).toBe(1)
  })

  it('prepares again for a new image or rug size', () => {
    const cached = createCachedPipeline()
    const input = base({ image: triforce(300) })
    cached.run(input, 'image-1|800x800')
    cached.run({ ...input, rug: { widthMm: 600, heightMm: 600 } }, 'image-1|600x600')
    cached.run(input, 'image-2|800x800')
    expect(cached.preparedCount).toBe(3)
  })

  it('gives the same result from the cache as without it', () => {
    const cached = createCachedPipeline()
    const input = base({ image: withJpegNoise(triforce(300), 12, 5) })
    cached.run(input, 'k')
    const again = cached.run({ ...input, count: 3 }, 'k')
    const fresh = runPipeline({ ...input, count: 3 })
    expect(again.palette).toEqual(fresh.palette)
    expect(again.map.labels).toEqual(fresh.map.labels)
  })
})

describe('runPipeline: shaped and rectangular rugs', () => {
  const shaped = (overrides: Partial<PipelineInput> = {}) =>
    base({
      image: withSoftAlpha(circle(400), 2),
      rug: { widthMm: 400, heightMm: 400 },
      shape: 'shaped',
      offsetMm: 20,
      smoothMm: 5,
      ...overrides,
    })

  it('shaped: grows the rug beyond the art by the border, and reports the cut line', () => {
    const r = runPipeline(shaped())
    expect(r.cut).not.toBeNull()
    expect(r.cut!.length).toBe(1)
    // The map is padded by the border: the art area sits inside it.
    expect(r.artOriginMm.x).toBeGreaterThanOrEqual(20)
    expect(r.map.width * r.map.mmPerPx).toBeGreaterThanOrEqual(400 + 40)
    expect(r.pattern.rug.widthMm).toBe(r.map.width * r.map.mmPerPx)
  })

  it('shaped: fills the band between art and cut line with the border colour', () => {
    const r = runPipeline(shaped())
    expect(r.roles.border).not.toBeNull()
    const { width: w } = r.map
    // On the middle row, 10 mm outside the art's left edge: border.
    const y = Math.round(r.artOriginMm.y + 200)
    const x = Math.round(r.artOriginMm.x + 200 - 160 - 10)
    expect(r.map.labels[y * w + x]).toBe(r.roles.border)
    // 30 mm outside: beyond the cut, outside the rug.
    expect(r.map.labels[y * w + x - 20]).toBe(NO_LABEL)
  })

  it('shaped: the border takes the colour the art edge mostly has, reusing it', () => {
    const r = runPipeline(shaped())
    const red = srgbToOklab(FIXTURE.red)
    expect(deltaE(r.palette[r.roles.border!], red)).toBeLessThan(3)
    expect(r.palette.filter((p) => deltaE(p, red) < 3)).toHaveLength(1) // reused, not added twice
    expect(r.rolesAdded.border).toBe(false)
  })

  it('shaped: a chosen border yarn gets its own palette entry', () => {
    const black = srgbToOklab(FIXTURE.black)
    const r = runPipeline(shaped({ borderColour: black }))
    expect(r.palette[r.roles.border!]).toEqual(black)
    expect(r.rolesAdded.border).toBe(true)
  })

  it('shaped: removes a plain backdrop found along the edge (no transparency)', () => {
    const r = runPipeline(shaped({ image: circle(400) })) // red disk on white
    expect(r.background).toBe('edge-colour')
    expect(r.palette.some((p) => p.L > 0.95)).toBe(false) // no white left in the rug
  })

  it('shaped: a background edit turns a background area back into art', () => {
    // The Triforce on dark: the middle hole is background. Clicking it makes it art again.
    const input = base({
      image: triforce(400),
      rug: { widthMm: 400, heightMm: 400 },
      shape: 'shaped',
      offsetMm: 10,
    })
    const holeAt = { x: 200, y: 260 }
    const before = runPipeline(input)
    const after = runPipeline({ ...input, backgroundEdits: [{ at: holeAt, background: false }] })
    const label = (r: typeof before) => {
      const x = Math.round(r.artOriginMm.x + holeAt.x)
      const y = Math.round(r.artOriginMm.y + holeAt.y)
      return r.map.labels[y * r.map.width + x]
    }
    expect(label(before)).toBe(NO_LABEL) // a big hole of background is cut out of the rug
    expect(deltaE(after.palette[label(after)], srgbToOklab(FIXTURE.dark))).toBeLessThan(3)
  })

  it('shaped: a background edit turns an area of art into background', () => {
    const input = shaped({ image: smallEye(400, 0.01), offsetMm: 5 }) // yellow face on white
    const eyeAt = { x: 400 / 2 - 0.15 * 400, y: 400 / 2 - 0.1 * 400 }
    const r = runPipeline({ ...input, backgroundEdits: [{ at: eyeAt, background: true }] })
    expect(r.palette.some((p) => deltaE(p, srgbToOklab(FIXTURE.navy)) < 3)).toBe(false)
  })

  it('rectangle: fills empty space with the background yarn, nothing outside the rug', () => {
    const r = runPipeline(
      base({ image: withSoftAlpha(circle(300), 2), rug: { widthMm: 400, heightMm: 300 } }),
    )
    expect(r.cut).toBeNull()
    expect(r.roles.background).not.toBeNull()
    expect(r.palette[r.roles.background!].L).toBeGreaterThan(0.99) // white by default
    expect(r.map.labels.includes(NO_LABEL)).toBe(false)
    expect([r.map.width, r.map.height]).toEqual([400, 300])
  })

  it('rectangle: keeps a white backdrop of a JPEG as a colour of the art (no detection)', () => {
    const r = runPipeline(base({ image: circle(300), rug: { widthMm: 300, heightMm: 300 } }))
    expect(r.background).toBe('none')
    expect(r.palette.some((p) => p.L > 0.95)).toBe(true)
  })
})
