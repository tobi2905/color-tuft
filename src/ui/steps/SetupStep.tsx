import { useState } from 'react'
import { loadImageFile } from '../../render/loadImage'
import { ImageCanvas } from '../ImageCanvas'
import { YarnColourField } from '../YarnColourField'
import { useProject } from '../store/useProject'
import { parseCm, rugSizeErrors } from '../validation'

/** Step 1: the image, the real rug size, the rug's shape and how many colours. */
export function SetupStep() {
  const source = useProject((s) => s.source)
  const setSource = useProject((s) => s.setSource)
  const rug = useProject((s) => s.rug)
  const setRug = useProject((s) => s.setRug)
  const shape = useProject((s) => s.shape)
  const setShape = useProject((s) => s.setShape)
  const count = useProject((s) => s.count)
  const setCount = useProject((s) => s.setCount)
  const suggested = useProject((s) => s.result?.suggestedCount ?? null)
  const setStep = useProject((s) => s.setStep)
  const palette = useProject((s) => s.palette)
  const backgroundColour = useProject((s) => s.backgroundColour)
  const setBackgroundColour = useProject((s) => s.setBackgroundColour)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // What the user typed; the store only gets valid sizes.
  const [widthCm, setWidthCm] = useState(String(rug.widthMm / 10))
  const [heightCm, setHeightCm] = useState(String(rug.heightMm / 10))
  const errors = rugSizeErrors(widthCm, heightCm)

  async function openFile(file: File | undefined) {
    if (!file) return
    setLoadError(null)
    try {
      const { grid, downscaled } = await loadImageFile(file)
      setSource({ grid, name: file.name, downscaled })
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }

  function changeSize(width: string, height: string) {
    setWidthCm(width)
    setHeightCm(height)
    const e = rugSizeErrors(width, height)
    if (!e.width && !e.height) {
      setRug({ widthMm: parseCm(width)! * 10, heightMm: parseCm(height)! * 10 })
    }
  }

  function matchImageProportions() {
    const width = parseCm(widthCm)
    if (!source || width === null) return
    const height = Math.round(((width * source.grid.height) / source.grid.width) * 10) / 10
    changeSize(widthCm, String(height))
  }

  return (
    <div className="setup">
      <section className="card">
        <h3>Image</h3>
        <label
          className={`dropzone${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void openFile(e.dataTransfer.files[0])
          }}
        >
          {source ? (
            <ImageCanvas grid={source.grid} label={`Uploaded image: ${source.name}`} />
          ) : (
            <span>Drop an image here, or click to choose one (PNG, JPEG or WebP).</span>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            onChange={(e) => void openFile(e.target.files?.[0])}
          />
        </label>
        {source && (
          <p className="hint">
            {source.name}, {source.grid.width} × {source.grid.height} px. Drop or click to replace.
          </p>
        )}
        {source?.downscaled && (
          <p className="notice">
            This image was very large, so it was scaled down to {source.grid.width} ×{' '}
            {source.grid.height} px. That is still more detail than a rug can show.
          </p>
        )}
        {loadError && (
          <p className="error" role="alert">
            {loadError}
          </p>
        )}
      </section>

      <section className="card">
        <h3>Rug size</h3>
        <div className="field-row">
          <label className="field">
            Width (cm)
            <input
              inputMode="decimal"
              value={widthCm}
              aria-invalid={errors.width !== null}
              onChange={(e) => changeSize(e.target.value, heightCm)}
            />
            {errors.width && <span className="error">{errors.width}</span>}
          </label>
          <label className="field">
            Height (cm)
            <input
              inputMode="decimal"
              value={heightCm}
              aria-invalid={errors.height !== null}
              onChange={(e) => changeSize(widthCm, e.target.value)}
            />
            {errors.height && <span className="error">{errors.height}</span>}
          </label>
        </div>
        <button type="button" onClick={matchImageProportions} disabled={!source || !!errors.width}>
          Match image proportions (keep the width)
        </button>
      </section>

      <section className="card">
        <h3>Shape</h3>
        <label className="choice">
          <input
            type="radio"
            name="shape"
            checked={shape === 'shaped'}
            onChange={() => setShape('shaped')}
          />
          Shaped: cut along the artwork
        </label>
        <label className="choice">
          <input
            type="radio"
            name="shape"
            checked={shape === 'rectangle'}
            onChange={() => setShape('rectangle')}
          />
          Rectangle: the rest is filled with a background yarn
        </label>
        {shape === 'rectangle' && (
          <YarnColourField
            label="Background yarn"
            value={backgroundColour}
            onChange={setBackgroundColour}
            palette={palette}
            automatic="white"
          />
        )}
      </section>

      <section className="card">
        <h3>Colours</h3>
        <label className="field">
          Number of colours
          <input
            type="number"
            min={1}
            max={16}
            value={count ?? ''}
            placeholder={suggested ? String(suggested) : 'auto'}
            onChange={(e) => setCount(e.target.value === '' ? null : Number(e.target.value))}
          />
        </label>
        <p className="hint">
          {suggested
            ? `This art has ${suggested} colours. Leave empty to use that.`
            : 'Leave empty to use the number the app suggests.'}
        </p>
      </section>

      <div className="actions">
        <button type="button" disabled={!source} onClick={() => setStep('colours')}>
          Next: Colours
        </button>
      </div>
    </div>
  )
}
