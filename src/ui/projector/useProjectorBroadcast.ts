import { useEffect } from 'react'
import { projectStore } from '../store/useProject'
import { PROJECTOR_CHANNEL, type ProjectorMessage, projectorStateFrom } from './sync'

/**
 * The laptop side of the projector window: sends what the projector draws whenever it changes
 * (only the parts that changed, so the big pattern isn't resent for a colour step), and sends
 * everything when a projector window asks for it.
 */
export function useProjectorBroadcast(): void {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(PROJECTOR_CHANNEL)
    const send = (message: ProjectorMessage) => channel.postMessage(message)
    let last = projectorStateFrom(projectStore.getState())

    channel.onmessage = (e: MessageEvent) => {
      if ((e.data as ProjectorMessage)?.type === 'request') {
        send({ type: 'state', state: projectorStateFrom(projectStore.getState()) })
      }
    }
    const unsubscribe = projectStore.subscribe((state) => {
      const next = projectorStateFrom(state)
      const changed = Object.fromEntries(
        (Object.keys(next) as (keyof typeof next)[])
          .filter((k) => next[k] !== last[k])
          .map((k) => [k, next[k]]),
      )
      last = next
      if (Object.keys(changed).length > 0) send({ type: 'state', state: changed })
    })
    return () => {
      unsubscribe()
      channel.close()
    }
  }, [])
}
