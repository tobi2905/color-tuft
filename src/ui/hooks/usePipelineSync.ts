import { useEffect } from 'react'
import { pipelineInputFrom } from '../pipelineInput'
import { projectStore, useProject } from '../store/useProject'
import { usePipeline } from './usePipeline'

/** Wait this long after the last change before running, so typing a size doesn't start ten runs. */
export const PIPELINE_DELAY_MS = 300

/**
 * Keeps the pattern up to date: whenever the image or a setting the pipeline uses changes,
 * runs it again in the worker, and puts each new result into the project.
 * Returns whether a run is going and the last error, for the header.
 */
export function usePipelineSync(): { running: boolean; error: string | null } {
  const { result, running, error, run } = usePipeline()
  const source = useProject((s) => s.source)
  const widthMm = useProject((s) => s.rug.widthMm)
  const heightMm = useProject((s) => s.rug.heightMm)
  const count = useProject((s) => s.count)
  const minDetailMm = useProject((s) => s.minDetailMm)
  // Locked colours as text, so an equal set of locks counts as "no change".
  const locked = useProject((s) =>
    JSON.stringify(s.palette.filter((p) => p.locked).map((p) => p.lab)),
  )
  const outlines = useProject((s) => JSON.stringify(s.outlines))
  const thicken = useProject((s) => JSON.stringify(s.thicken))
  const setResult = useProject((s) => s.setResult)

  useEffect(() => {
    const input = pipelineInputFrom(projectStore.getState())
    if (!input) return
    const timer = setTimeout(() => run(input), PIPELINE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [source, widthMm, heightMm, count, minDetailMm, locked, outlines, thicken, run])

  useEffect(() => {
    if (result) setResult(result)
  }, [result, setResult])

  return { running, error }
}
