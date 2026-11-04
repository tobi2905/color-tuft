import { useEffect, useRef, useState } from 'react'
import { drawProjector } from '../../render/projector/drawProjector'
import { useWakeLock } from '../hooks/useWakeLock'
import { PROJECTOR_CHANNEL, type ProjectorState, applyMessage } from './sync'

/**
 * The projector window (…/#projector): only the picture, black, filling the window. It follows
 * the laptop window live over a BroadcastChannel and keeps the screen awake. Click once to go
 * fullscreen (browsers only allow that after a click in this window).
 */
export function ProjectorWindow() {
  const [state, setState] = useState<ProjectorState | null>(null)
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [fullscreen, setFullscreen] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  useWakeLock(true)

  useEffect(() => {
    document.title = 'Color Tuft: projector'
    const channel = new BroadcastChannel(PROJECTOR_CHANNEL)
    channel.onmessage = (e: MessageEvent) => setState((s) => applyMessage(s, e.data))
    channel.postMessage({ type: 'request' })
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    const onFullscreen = () => setFullscreen(document.fullscreenElement !== null)
    window.addEventListener('resize', onResize)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      channel.close()
      window.removeEventListener('resize', onResize)
      document.removeEventListener('fullscreenchange', onFullscreen)
    }
  }, [])

  useEffect(() => {
    if (canvas.current && state) drawProjector(canvas.current, viewport, state)
  }, [state, viewport])

  return (
    <div
      className="projector-window"
      onClick={() => !fullscreen && document.documentElement.requestFullscreen()}
    >
      <canvas ref={canvas} aria-label="The projector picture" />
      {!state && (
        <p className="projector-hint">Waiting for Color Tuft… keep the main window open.</p>
      )}
      {state && !fullscreen && (
        <p className="projector-hint">
          Drag this window onto the projector, then click to go fullscreen.
        </p>
      )}
    </div>
  )
}
