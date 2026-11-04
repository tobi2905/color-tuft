import { describe, expect, it } from 'vitest'
import { connectedRegions } from '../../src/core/cleanup/regions'
import { srgbToOklab } from '../../src/core/color/convert'
import { deltaE } from '../../src/core/color/distance'
import { type PipelineInput, runPipeline } from '../../src/core/pipeline'
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

  it('gives the same result for the same input', () => {
    const a = runPipeline(base({ image: withJpegNoise(triforce(300), 12, 5) }))
    const b = runPipeline(base({ image: withJpegNoise(triforce(300), 12, 5) }))
    expect(a.palette).toEqual(b.palette)
    expect(a.map.labels).toEqual(b.map.labels)
  })
})
