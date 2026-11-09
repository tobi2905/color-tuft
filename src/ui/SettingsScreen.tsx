import { useSettings } from './store/settingsStore'

/** App-wide preferences, grouped in cards. More settings join here later. */
export function SettingsScreen() {
  const keepYarnPhotos = useSettings((s) => s.keepYarnPhotos)
  const setKeepYarnPhotos = useSettings((s) => s.setKeepYarnPhotos)
  return (
    <div className="settings-screen">
      <section className="card">
        <h3>Yarn photos</h3>
        <label className="choice">
          <input
            type="checkbox"
            checked={keepYarnPhotos}
            onChange={(e) => setKeepYarnPhotos(e.target.checked)}
          />
          Keep a small photo of each yarn
        </label>
        <p className="hint">
          When a yarn's colour is taken from a photo, a small square around the spot you clicked is
          kept and shown in the yarn list, so you can recognise the cone. Turning this off keeps
          photos already saved; remove those in the yarn's Edit form.
        </p>
      </section>
    </div>
  )
}
