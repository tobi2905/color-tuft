/// <reference lib="webworker" />
import * as Comlink from 'comlink'
import { type PipelineInput, type PipelineResult, createCachedPipeline } from '../core/pipeline'

/**
 * Runs the pipeline off the main thread, so the page stays responsive. Comlink turns the
 * postMessage traffic into a plain async call. The colour map's memory is transferred back
 * (handed over, not copied). The prepared image is kept between runs: while `imageKey` stays
 * the same, colour changes skip resizing, denoising and sampling.
 */
const pipeline = createCachedPipeline()
const api = {
  run(input: PipelineInput, imageKey: string): PipelineResult {
    const result = pipeline.run(input, imageKey)
    return Comlink.transfer(result, [result.map.labels.buffer])
  },
}

export type PipelineWorkerApi = typeof api

Comlink.expose(api)
