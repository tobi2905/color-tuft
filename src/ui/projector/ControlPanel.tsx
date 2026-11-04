import { coloursInPattern, stepFocus } from '../../render/projector/focus'
import { useProject } from '../store/useProject'

/**
 * One colour at a time: switch it on, step with Previous/Next (or the Left/Right arrow keys),
 * and see the current yarn large: swatch, number and name.
 */
export function ControlPanel() {
  const pattern = useProject((s) => s.result?.pattern ?? null)
  const palette = useProject((s) => s.palette)
  const focus = useProject((s) => s.projector.focus)
  const setFocus = useProject((s) => s.setFocus)
  if (!pattern) return null
  const colours = coloursInPattern(pattern)
  const entry = focus === null ? null : palette[focus]

  return (
    <div className="control-panel">
      <label className="choice">
        <input
          type="checkbox"
          checked={focus !== null}
          onChange={(e) => setFocus(e.target.checked ? stepFocus(null, colours, 1) : null)}
        />
        One colour at a time
      </label>
      {entry && (
        <>
          <div className="current-yarn" aria-live="polite">
            <span className="swatch large" style={{ background: entry.hex }} aria-hidden="true" />
            <span>
              <span className="current-number">{entry.number}</span> {entry.name}
            </span>
          </div>
          <p className="hint">
            {colours.indexOf(focus!) + 1} of {colours.length} colours · Left/Right arrow keys step
          </p>
          <div className="palette-actions">
            <button type="button" onClick={() => setFocus(stepFocus(focus, colours, -1))}>
              ← Previous
            </button>
            <button type="button" onClick={() => setFocus(stepFocus(focus, colours, 1))}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
