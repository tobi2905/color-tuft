import type { PipelineInput } from '../core/pipeline'
import type { ProjectState } from './store/projectStore'

/** Seed for the pipeline's random choices: fixed, so the same project gives the same pattern. */
export const PIPELINE_SEED = 1

/** The pipeline settings for the project, or null while there is no image. Outlines: Phase 6.4. */
export function pipelineInputFrom(state: ProjectState): PipelineInput | null {
  if (!state.source) return null
  return {
    image: state.source.grid,
    rug: state.rug,
    count: state.count,
    locked: state.palette.filter((p) => p.locked).map((p) => p.lab),
    minDetailMm: state.minDetailMm,
    outlines: null,
    seed: PIPELINE_SEED,
  }
}
