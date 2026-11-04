import type { CutLoop } from '../../core/outline/cutLine'
import type { PaletteEntry, RugSize, VectorPattern } from '../../core/types'
import type { ProjectState } from '../store/projectStore'

/** The BroadcastChannel the laptop window and the projector window talk on. */
export const PROJECTOR_CHANNEL = 'color-tuft-projector'

/** Everything the projector window needs to draw. */
export type ProjectorState = {
  rug: RugSize
  pattern: VectorPattern | null
  palette: PaletteEntry[]
  cut: CutLoop[] | null
  projector: ProjectState['projector']
}

/**
 * Laptop → projector: 'state', a full or partial update. Projector → laptop: 'request', "send
 * me everything" (when the projector window has just opened).
 */
export type ProjectorMessage =
  { type: 'state'; state: Partial<ProjectorState> } | { type: 'request' }

/**
 * The projector window's state after a message. Only 'state' messages change it; a partial
 * update merges into the current state; anything else (requests, unknown or malformed
 * messages) leaves it as it is. Without a state yet, only a full one is taken.
 */
export function applyMessage(
  state: ProjectorState | null,
  message: unknown,
): ProjectorState | null {
  if (typeof message !== 'object' || message === null) return state
  const m = message as { type?: unknown; state?: unknown }
  if (m.type !== 'state' || typeof m.state !== 'object' || m.state === null) return state
  const update = m.state as Partial<ProjectorState>
  if (state) return { ...state, ...update }
  const complete =
    update.rug && update.palette && update.projector && 'pattern' in update && 'cut' in update
  return complete ? (update as ProjectorState) : null
}

/** The part of the project the projector draws. */
export function projectorStateFrom(project: ProjectState): ProjectorState {
  return {
    rug: project.result?.pattern.rug ?? project.rug,
    pattern: project.result?.pattern ?? null,
    palette: project.palette,
    cut: project.result?.cut ?? null,
    projector: project.projector,
  }
}
