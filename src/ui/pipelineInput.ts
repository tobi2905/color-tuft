import { srgbToOklab } from '../core/color/convert'
import type { PipelineInput } from '../core/pipeline'
import type { ProjectState } from './store/projectStore'

/** Seed for the pipeline's random choices: fixed, so the same project gives the same pattern. */
export const PIPELINE_SEED = 1

const BLACK = srgbToOklab({ r: 0, g: 0, b: 0 })

/**
 * The pipeline settings for the project, or null while there is no image. Outlines only when
 * turned on, in the chosen colour, else the darkest palette colour (black before any are known).
 */
export function pipelineInputFrom(state: ProjectState): PipelineInput | null {
  if (!state.source) return null
  return {
    image: state.source.grid,
    rug: state.rug,
    count: state.count,
    locked: state.palette.filter((p) => p.locked).map((p) => p.lab),
    minDetailMm: state.minDetailMm,
    outlines: state.outlines.enabled
      ? {
          widthMm: state.outlines.widthMm,
          colour: state.outlines.colour ?? darkest(state) ?? BLACK,
          where: state.outlines.where,
        }
      : null,
    thicken: state.thicken,
    merges: state.merges.map(({ from, into }) => ({ from, into })),
    seed: PIPELINE_SEED,
  }
}

function darkest(state: ProjectState) {
  if (state.palette.length === 0) return null
  return state.palette.reduce((a, b) => (b.lab.L < a.lab.L ? b : a)).lab
}
