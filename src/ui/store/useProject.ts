import { useStore } from 'zustand'
import { type ProjectActions, type ProjectState, createProjectStore } from './projectStore'

/** The app's one project. */
export const projectStore = createProjectStore()

/** Reads a piece of the project in a component; re-renders when that piece changes. */
export function useProject<T>(selector: (state: ProjectState & ProjectActions) => T): T {
  return useStore(projectStore, selector)
}
