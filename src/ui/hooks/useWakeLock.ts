import { useEffect } from 'react'

/**
 * Keeps the screen from going to sleep while `active` (Screen Wake Lock). Browsers release the
 * lock whenever the tab is hidden, so it is asked for again each time it becomes visible.
 * Where the API is missing (or refused), nothing happens: the projector just may dim.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    // The current lock and whether this effect has ended (an object, not reassigned variables).
    const held: { lock: WakeLockSentinel | null; cancelled: boolean } = {
      lock: null,
      cancelled: false,
    }
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request('screen')
        if (held.cancelled) void next.release()
        else held.lock = next
      } catch {
        // Refused (e.g. the tab is hidden or the battery is low): try again when visible.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      held.cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void held.lock?.release()
    }
  }, [active])
}
