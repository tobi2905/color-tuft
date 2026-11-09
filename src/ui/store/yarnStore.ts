import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { Yarn } from '../../core/types'

export type YarnChange = Partial<Omit<Yarn, 'id'>>

export type YarnState = { yarns: Yarn[] }

export type YarnActions = {
  /** Adds a yarn and returns its new id. */
  addYarn(yarn: Omit<Yarn, 'id'>): string
  /** Changes the given fields; a field set to undefined is removed. */
  updateYarn(id: string, change: YarnChange): void
  removeYarn(id: string): void
  /** A catalogue yarn that was bought: same yarn, now in stock. */
  moveToStock(id: string): void
}

/**
 * The user's yarns, stock and catalogue in one list (each yarn says which list it is on).
 * Separate from the project: yarns are kept across projects. In memory until Phase 11.
 */
export function createYarnStore() {
  return createStore<YarnState & YarnActions>()((set, get) => {
    const change = (id: string, f: (yarn: Yarn) => Yarn) =>
      set({ yarns: get().yarns.map((y) => (y.id === id ? f(y) : y)) })

    return {
      yarns: [],
      addYarn(yarn) {
        const id = crypto.randomUUID()
        set({ yarns: [...get().yarns, { ...yarn, id }] })
        return id
      },
      updateYarn: (id, c) => change(id, (y) => withoutUndefined({ ...y, ...c, id })),
      removeYarn: (id) => set({ yarns: get().yarns.filter((y) => y.id !== id) }),
      moveToStock: (id) => change(id, (y) => ({ ...y, list: 'stock' })),
    }
  })
}

/** Drops keys whose value is undefined, so a cleared field is gone rather than present-but-empty. */
function withoutUndefined(yarn: Yarn): Yarn {
  return Object.fromEntries(Object.entries(yarn).filter(([, v]) => v !== undefined)) as Yarn
}

/** The app's yarns. */
export const yarnStore = createYarnStore()

/** Reads a piece of the yarns in a component; re-renders when that piece changes. */
export function useYarns<T>(selector: (state: YarnState & YarnActions) => T): T {
  return useStore(yarnStore, selector)
}
