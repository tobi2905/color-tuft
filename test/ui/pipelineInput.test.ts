import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../src/core/color/convert'
import type { PipelineResult } from '../../src/core/pipeline'
import { pipelineInputFrom } from '../../src/ui/pipelineInput'
import { createProjectStore } from '../../src/ui/store/projectStore'

const grid = { width: 2, height: 2, data: new Uint8ClampedArray(16) }
const gold = srgbToOklab({ r: 255, g: 215, b: 0 })
const dark = srgbToOklab({ r: 27, g: 27, b: 27 })

describe('pipelineInputFrom', () => {
  it('is null without an image', () => {
    expect(pipelineInputFrom(createProjectStore().getState())).toBeNull()
  })

  it('passes image, rug, count, minimum detail; outlines off', () => {
    const store = createProjectStore()
    store.getState().setSource({ grid, name: 'a.png', downscaled: false })
    store.getState().setRug({ widthMm: 1200, heightMm: 800 })
    store.getState().setCount(5)
    const input = pipelineInputFrom(store.getState())!
    expect(input.image).toBe(grid)
    expect(input.rug).toEqual({ widthMm: 1200, heightMm: 800 })
    expect(input.count).toBe(5)
    expect(input.minDetailMm).toBe(10)
    expect(input.outlines).toBeNull()
    expect(input.locked).toEqual([])
  })

  it('passes null as the count when the suggested count is wanted', () => {
    const store = createProjectStore()
    store.getState().setSource({ grid, name: 'a.png', downscaled: false })
    expect(pipelineInputFrom(store.getState())!.count).toBeNull()
  })

  it('passes the locked colours exactly', () => {
    const store = createProjectStore()
    store.getState().setSource({ grid, name: 'a.png', downscaled: false })
    store.getState().setResult({ palette: [gold, dark], suggestedCount: 2 } as PipelineResult)
    store.getState().toggleLock(2)
    expect(pipelineInputFrom(store.getState())!.locked).toEqual([dark])
  })

  it('passes outlines only when they are on, in the darkest palette colour unless one is chosen', () => {
    const store = createProjectStore()
    store.getState().setSource({ grid, name: 'a.png', downscaled: false })
    store.getState().setResult({ palette: [gold, dark], suggestedCount: 2 } as PipelineResult)
    expect(pipelineInputFrom(store.getState())!.outlines).toBeNull()
    store.getState().setOutlines({ enabled: true, widthMm: 12, where: 'outer' })
    expect(pipelineInputFrom(store.getState())!.outlines).toEqual({
      widthMm: 12,
      colour: dark,
      where: 'outer',
    })
    store.getState().setOutlines({ colour: gold })
    expect(pipelineInputFrom(store.getState())!.outlines?.colour).toEqual(gold)
  })

  it('uses black for outlines before any colours are known', () => {
    const store = createProjectStore()
    store.getState().setSource({ grid, name: 'a.png', downscaled: false })
    store.getState().setOutlines({ enabled: true })
    expect(pipelineInputFrom(store.getState())!.outlines?.colour).toEqual(
      srgbToOklab({ r: 0, g: 0, b: 0 }),
    )
  })

  it('passes the colours to thicken', () => {
    const store = createProjectStore()
    store.getState().setSource({ grid, name: 'a.png', downscaled: false })
    store.getState().toggleThicken(dark)
    expect(pipelineInputFrom(store.getState())!.thicken).toEqual([dark])
  })
})
