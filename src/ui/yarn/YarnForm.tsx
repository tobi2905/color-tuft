import { useState } from 'react'
import type { Yarn } from '../../core/types'
import { BlobImage } from '../BlobImage'
import { useSettings } from '../store/settingsStore'
import { PhotoSampler } from './PhotoSampler'
import {
  type YarnDraft,
  draftFromYarn,
  draftToYarn,
  emptyDraft,
  normaliseHex,
  yarnDraftErrors,
} from './yarnDraft'

type Props = {
  list: Yarn['list']
  /** The yarn being edited, or undefined for a new one. */
  yarn?: Yarn
  onSave(yarn: Omit<Yarn, 'id'>): void
  onCancel(): void
}

/**
 * Add or edit one yarn: colour (picker, code or from a photo), name, number, grams, cone weight,
 * shop.
 */
export function YarnForm({ list, yarn, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<YarnDraft>(() => (yarn ? draftFromYarn(yarn) : emptyDraft()))
  // Errors show once the user has tried to save, not while they are still typing.
  const [tried, setTried] = useState(false)
  const [fromPhoto, setFromPhoto] = useState(false)
  // The yarn's photo is a Blob, so it is kept beside the text fields rather than in the draft.
  const [photo, setPhoto] = useState<Blob | undefined>(yarn?.photo)
  const keepPhotos = useSettings((s) => s.keepYarnPhotos)
  const errors = yarnDraftErrors(draft)
  const valid = Object.values(errors).every((e) => e === null)
  const shown = (key: keyof typeof errors) => (tried ? errors[key] : null)
  const edit = (change: Partial<YarnDraft>) => setDraft((d) => ({ ...d, ...change }))

  function save() {
    setTried(true)
    if (valid) onSave({ ...draftToYarn(draft, list), ...(photo ? { photo } : {}) })
  }

  const text = (key: keyof YarnDraft, label: string, error: string | null = null) => (
    <label className="field">
      {label}
      <input
        value={draft[key]}
        aria-invalid={error !== null}
        inputMode={key === 'gramsOnHand' || key === 'coneWeightG' ? 'decimal' : undefined}
        onChange={(e) => edit({ [key]: e.target.value })}
      />
      {error && <span className="error">{error}</span>}
    </label>
  )

  return (
    <form
      className="yarn-form card"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <h3>
        {yarn
          ? `Edit ${yarn.name}`
          : list === 'stock'
            ? 'Add a yarn you own'
            : 'Add a yarn to the catalogue'}
      </h3>
      <div className="field-row">
        <label className="field colour-field">
          Colour
          <input
            type="color"
            // The picker needs a valid code; while the text is half-typed it shows grey.
            value={normaliseHex(draft.hex) ?? '#808080'}
            onChange={(e) => edit({ hex: e.target.value.toUpperCase() })}
          />
        </label>
        {text('hex', 'Colour code', shown('hex'))}
        {!fromPhoto && (
          <button type="button" className="photo-button" onClick={() => setFromPhoto(true)}>
            From a photo…
          </button>
        )}
      </div>
      {fromPhoto && (
        <PhotoSampler
          onSample={(hex) => edit({ hex })}
          onCrop={keepPhotos ? setPhoto : undefined}
          onClose={() => setFromPhoto(false)}
        />
      )}
      {photo && (
        <div className="yarn-photo-field">
          <BlobImage className="yarn-photo" blob={photo} alt="Photo of the yarn" />
          <button type="button" onClick={() => setPhoto(undefined)}>
            Remove photo
          </button>
        </div>
      )}
      <div className="field-row">
        {text('name', 'Name', shown('name'))}
        {text('number', 'Number (optional)')}
      </div>
      <div className="field-row">
        {list === 'stock' && text('gramsOnHand', 'Grams on hand', shown('gramsOnHand'))}
        {text('coneWeightG', 'Cone weight (g)', shown('coneWeightG'))}
      </div>
      {text('shop', list === 'stock' ? 'Shop (where to buy more)' : 'Shop or brand')}
      <div className="form-actions">
        <button type="submit">{yarn ? 'Save' : 'Add yarn'}</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
