import { STEP_LABELS } from './stepLabels'
import { STEPS, type Step } from './store/projectStore'

type Props = {
  /** The step shown, or null when another screen (Settings) is open. */
  current: Step | null
  available: Step[]
  onSelect(step: Step): void
}

/** The six steps, numbered. Steps without their data yet are shown but can't be chosen. */
export function Stepper({ current, available, onSelect }: Props) {
  return (
    <nav className="stepper" aria-label="Steps">
      <ol>
        {STEPS.map((step, i) => (
          <li key={step}>
            <button
              type="button"
              disabled={!available.includes(step)}
              aria-current={step === current ? 'step' : undefined}
              onClick={() => onSelect(step)}
            >
              <span className="stepper-number">{i + 1}</span> {STEP_LABELS[step]}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
