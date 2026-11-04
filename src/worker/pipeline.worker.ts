/// <reference lib="webworker" />
import * as Comlink from 'comlink'
import { type PipelineInput, type PipelineResult, runPipeline } from '../core/pipeline'

/**
 * Runs the pipeline off the main thread, so the page stays responsive. Comlink turns the
 * postMessage traffic into a plain async call. The colour map's memory is transferred back
 * (handed over, not copied).
 */
const api = {
  run(input: PipelineInput): PipelineResult {
    const result = runPipeline(input)
    return Comlink.transfer(result, [result.map.labels.buffer])
  },
}

export type PipelineWorkerApi = typeof api

Comlink.expose(api)
