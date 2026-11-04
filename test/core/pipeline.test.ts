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
    const result = runPipeline(base({ image: withSoftAlpha(triforce(400), 3), count: 4 }))
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
