import { useEffect, useRef, useState } from 'react'
import { calibrationLayout, drawCalibration } from '../../render/projector/calibration'
import { projectorTransform } from '../../render/projector/transform'
import { useProject } from '../store/useProject'
import { parseCm } from '../validation'

/** The first guess shows the whole rug with room around it: this share of the screen. */
const FIRST_FIT = 0.75

/**
 * The calibration screen: the rug's frame with corner crosshairs, a 10 cm bar and a 10 × 10 cm
 * square, white on black. Measure the bar on the cloth and type it in; arrow keys nudge the
 * picture (Shift: 10 px). In fullscreen, a small "Adjust" button opens the same controls.
 */
export function CalibrationView() {
  const rug = useProject((s) => s.result?.pattern.rug ?? s.rug)
  const projector = useProject((s) => s.projector)
  const initProjectorScale = useProject((s) => s.initProjectorScale)
  const nudge = useProject((s) => s.nudge)

  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [fullscreen, setFullscreen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)

  // Follow the stage's size (it changes when going fullscreen).
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const observer = new ResizeObserver(() =>
      setViewport({ w: el.clientWidth, h: el.clientHeight }),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stage.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // The starting scale, once: the whole rug fits the screen.
  useEffect(() => {
    if (viewport.w > 0) {
      initProjectorScale(FIRST_FIT * Math.min(viewport.w / rug.widthMm, viewport.h / rug.heightMm))
    }
  }, [viewport, rug, initProjectorScale])

  // Draw.
  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx || viewport.w === 0 || projector.pxPerMm === null) return
    const dpr = window.devicePixelRatio || 1
    el.width = viewport.w * dpr
    el.height = viewport.h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const t = projectorTransform({
      rug,
      viewport,
      pxPerMm: projector.pxPerMm,
      calibrationFactor: projector.factor,
      offsetPx: projector.offsetPx,
      mirror: projector.mirror,
    })
    drawCalibration(ctx, calibrationLayout(rug, t.toScreen, t.scale, viewport), viewport)
  }, [viewport, rug, projector])

  // Arrow keys nudge the picture: 1 px, or 10 px with Shift. Not while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const step = e.shiftKey ? 10 : 1
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      if (!move[e.key]) return
      e.preventDefault()
      nudge(...move[e.key])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nudge])

  return (
    <div className="projector">
      <div className="projector-stage" ref={stage}>
        <canvas ref={canvas} aria-label="Calibration picture for the projector" />
        {fullscreen && (
          <div className={overlayOpen ? 'projector-overlay open' : 'projector-overlay'}>
            {overlayOpen ? (
              <>
                <CalibrationControls
                  onFullscreen={() => document.exitFullscreen()}
                  fullscreenLabel="Exit fullscreen"
                />
                <button type="button" className="link" onClick={() => setOverlayOpen(false)}>
                  Hide
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setOverlayOpen(true)}>
                Adjust
              </button>
            )}
          </div>
        )}
      </div>
      <section className="card settings">
        <h3>Calibrate</h3>
        <ol className="steps-list">
          <li>Show this picture on the cloth (Fullscreen, on the projector's screen).</li>
          <li>Measure the bar marked "10 cm" on the cloth and enter what you measured.</li>
          <li>
            Measure the square's top and bottom edges: if they differ, the projector is tilted. Fix
            it with the projector's keystone setting.
          </li>
          <li>Use the arrow keys to move the frame onto your marks (Shift: faster).</li>
        </ol>
        <CalibrationControls
          onFullscreen={() => stage.current?.requestFullscreen()}
          fullscreenLabel="Fullscreen"
        />
      </section>
    </div>
  )
}

/** "I measured", Apply, Reset, fullscreen and mirror: the same in the side panel and overlay. */
function CalibrationControls({
  onFullscreen,
  fullscreenLabel,
}: {
  onFullscreen(): void
  fullscreenLabel: string
}) {
  const projector = useProject((s) => s.projector)
  const applyMeasurement = useProject((s) => s.applyMeasurement)
  const resetCalibration = useProject((s) => s.resetCalibration)
  const setMirror = useProject((s) => s.setMirror)
  const [measured, setMeasured] = useState('')
  const [error, setError] = useState<string | null>(null)

  function apply() {
    const cm = parseCm(measured)
    if (cm === null || cm <= 0) {
      setError('Enter the length you measured, in cm, e.g. 9.6.')
      return
    }
    setError(null)
    applyMeasurement(cm * 10)
    setMeasured('')
    // Let go of the keyboard, so the arrow keys move the picture again right away.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  return (
    <div className="calibration-controls">
      <label className="field">
        I measured (cm)
        <input
          inputMode="decimal"
          value={measured}
          onChange={(e) => setMeasured(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="palette-actions">
        <button type="button" onClick={apply}>
          Apply
        </button>
        <button type="button" onClick={resetCalibration}>
          Reset
        </button>
        <button type="button" onClick={onFullscreen}>
          {fullscreenLabel}
        </button>
      </div>
      <label className="choice">
        <input
          type="checkbox"
          checked={projector.mirror}
          onChange={(e) => setMirror(e.target.checked)}
        />
        Mirror (for tufting from the back of the cloth)
      </label>
      <p className="hint">
        Correction: {((projector.factor - 1) * 100).toFixed(1)}% · moved {projector.offsetPx.x},{' '}
        {projector.offsetPx.y} px · arrow keys move it
      </p>
    </div>
  )
}
