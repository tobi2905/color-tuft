import { srgbToOklab } from '../core/color/convert'
import { deltaE } from '../core/color/distance'
import type { PipelineInput } from '../core/pipeline'
import type { ProjectState } from './store/projectStore'

/**
 * Which prepared image the worker may reuse: the same image (each upload counts as new) at
 * the same rug size. Colour settings are not part of it, so changing them skips the image work.
 */
export function imageKeyFrom(state: ProjectState): string {
  // Only "bring back" clicks act on the image itself; removing works on the pattern.
  const restores = state.backgroundEdits.filter((e) => !e.background)
  return `${state.sourceId}|${state.rug.widthMm}x${state.rug.heightMm}|${state.shape}|${JSON.stringify(restores)}`
}

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
    // My yarns only: exactly the chosen yarns, nothing else.
    count: state.yarnsOnly ? state.yarnsOnly.yarns.length : state.count,
    locked: state.yarnsOnly ? state.yarnsOnly.yarns.map((y) => y.lab) : lockedColours(state),
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
    shape: state.shape,
    offsetMm: state.offsetMm,
    smoothMm: state.smoothMm,
    backgroundEdits: state.backgroundEdits,
    borderColour: state.borderColour,
    backgroundColour: state.backgroundColour,
    seed: PIPELINE_SEED,
  }
}

function darkest(state: ProjectState) {
  if (state.palette.length === 0) return null
  return state.palette.reduce((a, b) => (b.lab.L < a.lab.L ? b : a)).lab
}

/** Locked palette colours plus picked colours not in the palette yet, each once. */
function lockedColours(state: ProjectState) {
  const locked = state.palette.filter((p) => p.locked).map((p) => p.lab)
  for (const c of state.picked) {
    if (!locked.some((l) => deltaE(l, c) < 3)) locked.push(c)
  }
  return locked
}
