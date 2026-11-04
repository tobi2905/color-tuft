import { Stepper } from './Stepper'
import { usePipelineSync } from './hooks/usePipelineSync'
import { STEP_LABELS } from './stepLabels'
import { ColoursStep } from './steps/ColoursStep'
import { OutlineStep } from './steps/OutlineStep'
import { SetupStep } from './steps/SetupStep'
import { type Step, availableSteps } from './store/projectStore'
import { useProject } from './store/useProject'

/** Which task builds each step's screen; shown until it exists. */
const COMING_IN: Partial<Record<Step, string>> = {
  setup: '6.3',
  colours: '6.4',
  preview: '12.3',
  yarn: '9.6',
  projector: '8.2',
}

export default function App() {
  // Select plain values (stable between renders), then work out the available steps.
  const source = useProject((s) => s.source)
  const result = useProject((s) => s.result)
  const shape = useProject((s) => s.shape)
  const step = useProject((s) => s.step)
  const setStep = useProject((s) => s.setStep)
  const available = availableSteps({ source, result, shape })
  const { running, error } = usePipelineSync()

  return (
    <div className="app">
      <header className="app-header">
        <h1>Color Tuft</h1>
        <Stepper current={step} available={available} onSelect={setStep} />
        <p className="status" role="status">
          {running ? 'Working…' : ''}
        </p>
      </header>
      {error && (
        <p className="error banner" role="alert">
          Something went wrong while making the pattern: {error} The last good result is kept.
        </p>
      )}
      <main className="app-main">
        <h2>{STEP_LABELS[step]}</h2>
        {step === 'setup' ? (
          <SetupStep />
        ) : step === 'colours' ? (
          <ColoursStep />
        ) : step === 'outline' ? (
          <OutlineStep />
        ) : (
          <p className="placeholder">This step's screen comes in task {COMING_IN[step]}.</p>
        )}
      </main>
      <footer className="app-footer">
        <a href="https://github.com/tobi2905/color-tuft">Source code</a> · Free software under the{' '}
        <a href="https://www.gnu.org/licenses/agpl-3.0.html">AGPL-3.0</a>
      </footer>
    </div>
  )
}
