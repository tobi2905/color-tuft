import { useEffect, useRef } from 'react'
import { imageKeyFrom, pipelineInputFrom } from '../pipelineInput'
import { projectStore, useProject } from '../store/useProject'
import { usePipeline } from './usePipeline'

/**
 * After typing (a size, the minimum detail, the outline width) or dragging the colour slider,
 * wait this long before running, so one edit doesn't start ten runs. Clicks run at once.
 */
export const PIPELINE_DELAY_MS = 300

/**
 * Keeps the pattern up to date: whenever the image or a setting the pipeline uses changes,
 * runs it again in the worker (which reuses the prepared image while only colour settings
 * change), and puts each new result into the project.
 * Returns whether a run is going and the last error, for the header.
 */
export function usePipelineSync(): { running: boolean; error: string | null } {
  const { result, running, error, run } = usePipeline()
  const source = useProject((s) => s.source)
  // Settings changed by typing or dragging: these wait PIPELINE_DELAY_MS.
  const typed = useProject((s) =>
    JSON.stringify([
      s.rug.widthMm,
      s.rug.heightMm,
      s.minDetailMm,
      s.count,
      s.outlines.widthMm,
      s.offsetMm,
      s.smoothMm,
    ]),
  )
  // Settings changed by a click (as text, so an equal value counts as "no change").
  const clicked = useProject((s) =>
    JSON.stringify([
      s.palette.filter((p) => p.locked).map((p) => p.lab),
      s.picked,
      s.thicken,
      s.merges.map(({ from, into }) => [from, into]),
      s.outlines.enabled,
      s.outlines.where,
      s.outlines.colour,
      s.shape,
      s.backgroundEdits,
      s.borderColour,
      s.backgroundColour,
    ]),
  )
  const setResult = useProject((s) => s.setResult)
  const lastTyped = useRef(typed)

  useEffect(() => {
    const state = projectStore.getState()
    const input = pipelineInputFrom(state)
    if (!input) return
    const wait = typed !== lastTyped.current ? PIPELINE_DELAY_MS : 0
    lastTyped.current = typed
    const timer = setTimeout(() => run(input, imageKeyFrom(state)), wait)
    return () => clearTimeout(timer)
  }, [source, typed, clicked, run])

  useEffect(() => {
    if (result) setResult(result)
  }, [result, setResult])

  return { running, error }
}
