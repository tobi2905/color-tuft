import * as Comlink from 'comlink'
import { useSyncExternalStore } from 'react'
import type { PipelineInput } from '../../core/pipeline'
import type { PipelineWorkerApi } from '../../worker/pipeline.worker'
import { type PipelineApi, type PipelineRunner, createPipelineRunner } from '../pipelineRunner'

/**
 * The pipeline in a Web Worker. The image is copied, then the copy's memory is transferred
 * (the UI keeps its original). If the worker itself crashes (not just throws), the pending
 * run fails with a message and a fresh worker is started for the next run.
 */
function workerApi(): PipelineApi {
  let worker: Worker | null = null
  let remote: Comlink.Remote<PipelineWorkerApi> | null = null
  let crashed: Promise<never> = new Promise(() => {})

  const start = () => {
    worker = new Worker(new URL('../../worker/pipeline.worker.ts', import.meta.url), {
      type: 'module',
    })
    remote = Comlink.wrap<PipelineWorkerApi>(worker)
    crashed = new Promise((_, reject) => {
      worker!.addEventListener('error', (event) => {
        worker?.terminate()
        worker = null
        reject(new Error(`The image worker stopped: ${event.message || 'unknown error'}`))
      })
    })
  }

  return {
    async run(input: PipelineInput, imageKey: string) {
      if (!worker) start()
      const data = input.image.data.slice()
      const copy = { ...input, image: { ...input.image, data } }
      return Promise.race([remote!.run(Comlink.transfer(copy, [data.buffer]), imageKey), crashed])
    },
  }
}

let shared: PipelineRunner | null = null
const runner = () => (shared ??= createPipelineRunner(workerApi()))

/** `{ result, running, error, run(input) }` for the whole app: one worker, one runner. */
export function usePipeline() {
  const r = runner()
  const state = useSyncExternalStore(r.subscribe, r.getState)
  return { ...state, run: r.run }
}
