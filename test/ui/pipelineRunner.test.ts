import { describe, expect, it } from 'vitest'
import type { PipelineInput, PipelineResult } from '../../src/core/pipeline'
import { type PipelineApi, createPipelineRunner } from '../../src/ui/pipelineRunner'

const input = {} as PipelineInput // the fake workers below never look inside
const resultA = { suggestedCount: 1 } as PipelineResult
const resultB = { suggestedCount: 2 } as PipelineResult

/** A fake worker whose runs finish only when the test says so. */
function controllableApi() {
  const pending: { resolve: (r: PipelineResult) => void; reject: (e: unknown) => void }[] = []
  const api: PipelineApi = {
    run: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  }
  return { api, pending }
}

describe('createPipelineRunner', () => {
  it('starts empty', () => {
    const runner = createPipelineRunner(controllableApi().api)
    expect(runner.getState()).toEqual({ result: null, running: false, error: null })
  })

  it('is running while the worker works, then holds the result', async () => {
    const { api, pending } = controllableApi()
    const runner = createPipelineRunner(api)
    const done = runner.run(input)
    expect(runner.getState().running).toBe(true)
    pending[0].resolve(resultA)
    await done
    expect(runner.getState()).toEqual({ result: resultA, running: false, error: null })
  })

  it('keeps the last good result when a run fails, and shows the error', async () => {
    const { api, pending } = controllableApi()
    const runner = createPipelineRunner(api)
    const first = runner.run(input)
    pending[0].resolve(resultA)
    await first
    const second = runner.run(input)
    pending[1].reject(new Error('worker crashed'))
    await second
    expect(runner.getState()).toEqual({ result: resultA, running: false, error: 'worker crashed' })
  })

  it('clears the error after the next good run', async () => {
    let calls = 0
    const flaky: PipelineApi = {
      run: () => (calls++ === 0 ? Promise.reject(new Error('boom')) : Promise.resolve(resultB)),
    }
    const runner = createPipelineRunner(flaky)
    await runner.run(input)
    expect(runner.getState().error).toBe('boom')
    await runner.run(input)
    expect(runner.getState()).toEqual({ result: resultB, running: false, error: null })
  })

  it('turns anything thrown into a readable message', async () => {
    const runner = createPipelineRunner({ run: () => Promise.reject('just a string') })
    await runner.run(input)
    expect(runner.getState().error).toBe('just a string')
  })

  it('never lets an older, slower run overwrite a newer one', async () => {
    const { api, pending } = controllableApi()
    const runner = createPipelineRunner(api)
    const older = runner.run(input)
    const newer = runner.run(input)
    pending[1].resolve(resultB) // the newer one finishes first
    await newer
    pending[0].resolve(resultA) // the older one arrives late
    await older
    expect(runner.getState().result).toBe(resultB)
    expect(runner.getState().running).toBe(false)
  })

  it('stays running until the newest run is done', async () => {
    const { api, pending } = controllableApi()
    const runner = createPipelineRunner(api)
    const older = runner.run(input)
    runner.run(input)
    pending[0].resolve(resultA)
    await older
    expect(runner.getState().running).toBe(true)
  })

  it('tells subscribers about every change, and stops after unsubscribing', async () => {
    const { api, pending } = controllableApi()
    const runner = createPipelineRunner(api)
    let calls = 0
    const unsubscribe = runner.subscribe(() => calls++)
    const done = runner.run(input)
    pending[0].resolve(resultA)
    await done
    expect(calls).toBe(2) // started, finished
    unsubscribe()
    runner.run(input)
    expect(calls).toBe(2)
  })

  it('gives a new state object on every change (so React notices)', async () => {
    const { api, pending } = controllableApi()
    const runner = createPipelineRunner(api)
    const before = runner.getState()
    const done = runner.run(input)
    expect(runner.getState()).not.toBe(before)
    pending[0].resolve(resultA)
    await done
  })
})
