import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

/** App-wide preferences (not part of a project). In memory until Phase 11 adds saving. */
export type SettingsState = {
  /** Save a small crop of the photo a yarn's colour was taken from, shown in the yarn list. */
  keepYarnPhotos: boolean
}

export type SettingsActions = {
  setKeepYarnPhotos(keep: boolean): void
}

export function createSettingsStore() {
  return createStore<SettingsState & SettingsActions>()((set) => ({
    keepYarnPhotos: true,
    setKeepYarnPhotos: (keepYarnPhotos) => set({ keepYarnPhotos }),
  }))
}

/** The app's settings. */
export const settingsStore = createSettingsStore()

/** Reads a setting in a component; re-renders when it changes. */
export function useSettings<T>(selector: (state: SettingsState & SettingsActions) => T): T {
  return useStore(settingsStore, selector)
}
