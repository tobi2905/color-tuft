import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../src/core/color/convert'
import { deltaE } from '../../src/core/color/distance'
import { runPipeline } from '../../src/core/pipeline'
import { pipelineInputFrom } from '../../src/ui/pipelineInput'
import { createProjectStore } from '../../src/ui/store/projectStore'
import { FIXTURE, thinOutline } from '../fixtures/images'

/** What usePipelineSync does after each change: run the pipeline, store the result. */
function rerun(store: ReturnType<typeof createProjectStore>) {
  store.getState().setResult(runPipeline(pipelineInputFrom(store.getState())!))
}

const hasColour = (
  store: ReturnType<typeof createProjectStore>,
  rgb: { r: number; g: number; b: number },
) => store.getState().palette.some((p) => deltaE(p.lab, srgbToOklab(rgb)) < 3)

describe('merging and undoing, as the app does it', () => {
  it('brings the merged colour back after undo', () => {
    const store = createProjectStore()
    store.getState().setSource({ grid: thinOutline(300, 6), name: 'line.png', downscaled: false })
    store.getState().setRug({ widthMm: 600, heightMm: 600 })
    rerun(store)
    expect(hasColour(store, FIXTURE.red)).toBe(true)

    const red = store.getState().palette.find((p) => deltaE(p.lab, srgbToOklab(FIXTURE.red)) < 3)!
    const black = store
      .getState()
      .palette.find((p) => deltaE(p.lab, srgbToOklab(FIXTURE.black)) < 3)!
    store.getState().mergeColour(red.number, black.number)
    rerun(store)
    expect(hasColour(store, FIXTURE.red)).toBe(false)

    store.getState().undoMerge(0)
    rerun(store)
    expect(hasColour(store, FIXTURE.red)).toBe(true)
  })
})
