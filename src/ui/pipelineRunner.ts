import type { PipelineInput, PipelineResult } from '../core/pipeline'

/** Anything that can run the pipeline: the Web Worker in the app, a fake in tests. */
export type PipelineApi = { run(input: PipelineInput): Promise<PipelineResult> }
export type RunnerState = { result: PipelineResult | null; running: boolean; error: string | null }
export type PipelineRunner = {
  getState(): RunnerState
  subscribe(listener: () => void): () => void
  run(input: PipelineInput): Promise<void>
}

/**
 * Keeps track of pipeline runs for the UI, independent of React (so it is testable in Node).
 *
 * - A failed run keeps the last good result and sets `error` (the spec: a crash never
 *   throws away the user's work). The next good run clears the error.
 * - Only the newest run counts: if settings change while a run is still going, its late
 *   result is ignored, and `running` stays true until the newest run is done.
 * - Every change creates a new state object and tells the subscribers, as React's
 *   useSyncExternalStore expects.
 */
export function createPipelineRunner(api: PipelineApi): PipelineRunner {
  let state: RunnerState = { result: null, running: false, error: null }
  const listeners = new Set<() => void>()
  let newest = 0

  const update = (change: Partial<RunnerState>) => {
    state = { ...state, ...change }
    for (const listener of listeners) listener()
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async run(input) {
      const id = ++newest
      update({ running: true })
      try {
        const result = await api.run(input)
        if (id === newest) update({ result, running: false, error: null })
      } catch (e) {
        if (id === newest)
          update({ running: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
  }
}
