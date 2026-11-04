import type { Step } from './store/projectStore'

/** What each step is called in the interface. */
export const STEP_LABELS: Record<Step, string> = {
  setup: 'Setup',
  colours: 'Colours',
  outline: 'Outline',
  preview: 'Preview',
  yarn: 'Yarn',
  projector: 'Projector',
}
