import { useMemo, useRef, useState } from 'react'
import { hexToRgb, srgbToOklab } from '../../core/color/convert'
import { colourName } from '../../core/color/name'
import type { ImageGrid } from '../../core/types'
import { loadImageFile } from '../../render/loadImage'
import { useYarns } from '../store/yarnStore'
import { ClickableImage } from './ClickableImage'
import { sampleHex } from './photoSample'
import {
  type SwatchRow,
  autoNumber,
  swatchImportErrors,
  swatchSampleRadius,
  swatchesToYarns,
} from './swatchRows'

type Props = {
  /** Called after saving, with how many yarns were added and from which shop. */
  onImported(count: number, shop: string): void
  onCancel(): void
}

/**
 * Fill the catalogue from a screenshot of a shop's colour chart: click each swatch, type its
 * name and number, save them all at once.
 */
export function SwatchImport({ onImported, onCancel }: Props) {
  const yarns = useYarns((s) => s.yarns)
  const addYarn = useYarns((s) => s.addYarn)
  const [chart, setChart] = useState<ImageGrid | null>(null)
  const [shop, setShop] = useState('')
  const [rows, setRows] = useState<SwatchRow[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const nextId = useRef(1)
  // The newest row's name field takes the focus, so you can click a swatch and type at once.
  const [focusId, setFocusId] = useState<number | null>(null)

  const errors = swatchImportErrors(rows, shop, yarns)
  const valid = errors.shop === null && errors.rows.every((r) => !r.name && !r.number)
  const radius = chart ? swatchSampleRadius(chart) : 0
  const marks = useMemo(
    () => rows.map((r, i) => ({ ...r.at, r: radius, label: String(i + 1) })),
    [rows, radius],
  )

  async function open(file: File | undefined) {
    if (!file) return
    setMessage(null)
    try {
      setChart((await loadImageFile(file)).grid)
      setRows([])
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  function pick(at: { x: number; y: number }) {
    if (!chart) return
    const hex = sampleHex(chart, at, radius)
    if (!hex) {
      setMessage('That spot is transparent: click on a swatch.')
      return
    }
    setMessage(null)
    const id = nextId.current++
    // A suggested name, selected when its field takes the focus, so typing replaces it.
    const name = colourName(srgbToOklab(hexToRgb(hex)))
    setRows([...rows, { id, at, hex, name, number: '' }])
    setFocusId(id)
  }

  const change = (id: number, c: Partial<SwatchRow>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...c } : r)))

  function save() {
    setTried(true)
    if (!valid || rows.length === 0) return
    for (const yarn of swatchesToYarns(rows, shop)) addYarn(yarn)
    onImported(rows.length, shop.trim())
  }

  return (
    <div className="swatch-import card">
      <h3>Import from a colour chart</h3>
      <p className="hint">
        Take a screenshot of a shop's colour chart, then click each swatch and type its name and
        number. Screen colours are approximate: compare with the real yarn when you can.
      </p>
      <div className="field-row">
        <label className="field">
          Shop or brand
          <input
            value={shop}
            aria-invalid={tried && errors.shop !== null}
            onChange={(e) => setShop(e.target.value)}
          />
          {tried && errors.shop && <span className="error">{errors.shop}</span>}
        </label>
        <label className="field">
          Screenshot of the colour chart
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void open(e.target.files?.[0])}
          />
        </label>
      </div>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}

      {chart && (
        <div className="swatch-layout">
          <ClickableImage
            image={chart}
            marks={marks}
            onPick={pick}
            label="Colour chart: click a swatch to add it"
          />
          <div>
            {rows.length === 0 ? (
              <p className="hint">Click a swatch on the chart to add it.</p>
            ) : (
              <>
                <div className="swatch-tools">
                  <span className="hint">Suggested names: type over them.</span>
                  <button
                    type="button"
                    disabled={rows.every((r) => r.number.trim() !== '')}
                    onClick={() => setRows(autoNumber(rows, shop, yarns))}
                    title="Give every swatch without a number the next free number"
                  >
                    Number them
                  </button>
                </div>
                <ol className="swatch-rows">
                  {rows.map((r, i) => {
                    const e = errors.rows[i]
                    return (
                      <li key={r.id}>
                        <span className="palette-number">{i + 1}</span>
                        <span className="swatch" style={{ background: r.hex }} title={r.hex} />
                        <label className="field">
                          <span className="visually-hidden">Name of swatch {i + 1}</span>
                          <input
                            placeholder="Name"
                            value={r.name}
                            autoFocus={r.id === focusId}
                            onFocus={(ev) => ev.target.select()}
                            aria-invalid={tried && e.name !== null}
                            onChange={(ev) => change(r.id, { name: ev.target.value })}
                          />
                          {tried && e.name && <span className="error">{e.name}</span>}
                        </label>
                        <label className="field">
                          <span className="visually-hidden">Number of swatch {i + 1}</span>
                          <input
                            placeholder="Number"
                            value={r.number}
                            aria-invalid={e.number !== null}
                            onChange={(ev) => change(r.id, { number: ev.target.value })}
                          />
                          {/* A clash shows straight away: it can come from the catalogue. */}
                          {e.number && <span className="error">{e.number}</span>}
                        </label>
                        <button
                          type="button"
                          aria-label={`Remove swatch ${i + 1}`}
                          onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                        >
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </>
            )}
          </div>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="primary" disabled={rows.length === 0} onClick={save}>
          {rows.length === 1
            ? 'Add 1 yarn to the catalogue'
            : `Add ${rows.length} yarns to the catalogue`}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
