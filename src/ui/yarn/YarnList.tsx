import { useState } from 'react'
import type { Yarn } from '../../core/types'
import { BlobImage } from '../BlobImage'
import { useYarns, yarnStore } from '../store/yarnStore'
import { parseDecimal } from '../validation'
import { SwatchImport } from './SwatchImport'
import { YarnForm } from './YarnForm'

const TABS: { list: Yarn['list']; label: string; empty: string }[] = [
  { list: 'stock', label: 'Stock', empty: 'No yarns yet. Add the yarns you own.' },
  {
    list: 'catalogue',
    label: 'Catalogue',
    empty: "No yarns yet. Add yarns you could buy, e.g. a shop's colour range.",
  },
]

/** The yarns you own (Stock) and could buy (Catalogue), each with add, edit and remove. */
export function YarnList() {
  const yarns = useYarns((s) => s.yarns)
  const addYarn = useYarns((s) => s.addYarn)
  const updateYarn = useYarns((s) => s.updateYarn)
  const removeYarn = useYarns((s) => s.removeYarn)
  const addToStock = useYarns((s) => s.addToStock)
  const [list, setList] = useState<Yarn['list']>('stock')
  // 'new' = the add form is open; 'import' = the colour chart import; an id = that yarn is
  // being edited.
  const [editing, setEditing] = useState<string | null>(null)
  // What the last import or Add to stock did, shown until something else happens.
  const [note, setNote] = useState<string | null>(null)
  const tab = TABS.find((t) => t.list === list)!
  const shown = yarns.filter((y) => y.list === list)

  function switchTo(next: Yarn['list']) {
    setList(next)
    setEditing(null)
    setNote(null)
  }

  function open(what: string) {
    setEditing(what)
    setNote(null)
  }

  return (
    <section className="yarns">
      <div className="tabs" role="tablist" aria-label="Yarn lists">
        {TABS.map((t) => (
          <button
            key={t.list}
            type="button"
            role="tab"
            aria-selected={t.list === list}
            onClick={() => switchTo(t.list)}
          >
            {t.label} ({yarns.filter((y) => y.list === t.list).length})
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab.label}>
        {note && (
          <p className="notice" role="status">
            {note}
          </p>
        )}
        {shown.length === 0 && editing === null && <p className="hint">{tab.empty}</p>}
        <ul className="yarn-list">
          {shown.map((y) =>
            editing === y.id ? (
              <li key={y.id}>
                <YarnForm
                  list={list}
                  yarn={y}
                  onSave={(change) => {
                    // A field emptied in the form is removed from the yarn.
                    updateYarn(y.id, {
                      gramsOnHand: undefined,
                      coneWeightG: undefined,
                      shop: undefined,
                      photo: undefined,
                      ...change,
                    })
                    setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <YarnRow
                key={y.id}
                yarn={y}
                onEdit={() => open(y.id)}
                onRemove={() => removeYarn(y.id)}
                stockCopy={yarns.find((s) => s.list === 'stock' && s.fromCatalogue === y.id)}
                onAddToStock={
                  list === 'catalogue'
                    ? (grams) => {
                        const stockId = addToStock(y.id, grams)
                        const now = yarnStore.getState().yarns.find((s) => s.id === stockId)
                        setNote(
                          `Added ${grams === undefined ? '' : `${grams} g of `}${y.name} to stock` +
                            (now?.gramsOnHand !== undefined
                              ? ` (${now.gramsOnHand} g on hand).`
                              : '.'),
                        )
                      }
                    : undefined
                }
              />
            ),
          )}
        </ul>
        {editing === 'new' ? (
          <YarnForm
            list={list}
            onSave={(yarn) => {
              addYarn(yarn)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : editing === 'import' ? (
          <SwatchImport
            onImported={(count, shop) => {
              setEditing(null)
              setNote(`Added ${count} ${count === 1 ? 'yarn' : 'yarns'} from ${shop}.`)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div className="form-actions">
            <button type="button" onClick={() => open('new')}>
              Add a yarn
            </button>
            {list === 'catalogue' && (
              <button type="button" onClick={() => open('import')}>
                Import from a colour chart…
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function YarnRow({
  yarn,
  stockCopy,
  onEdit,
  onRemove,
  onAddToStock,
}: {
  yarn: Yarn
  /** Catalogue yarns: the stock yarn bought from it, if any. */
  stockCopy?: Yarn
  onEdit(): void
  onRemove(): void
  /** Catalogue yarns: buy it, with the grams bought (undefined: not entered). */
  onAddToStock?(grams?: number): void
}) {
  // Grams bought; a cone by default, the usual amount.
  const [grams, setGrams] = useState(yarn.coneWeightG === undefined ? '' : String(yarn.coneWeightG))
  const parsed = grams.trim() === '' ? undefined : parseDecimal(grams)
  const gramsValid = parsed === undefined || (parsed !== null && parsed > 0)
  const details = [
    yarn.list === 'stock' && yarn.gramsOnHand !== undefined
      ? `${yarn.gramsOnHand} g on hand`
      : null,
    yarn.coneWeightG !== undefined ? `${yarn.coneWeightG} g cones` : null,
    yarn.shop ?? null,
    stockCopy
      ? `in stock${stockCopy.gramsOnHand !== undefined ? `: ${stockCopy.gramsOnHand} g` : ''}`
      : null,
  ].filter((d) => d !== null)
  return (
    <li className="yarn-row">
      <span className="yarn-look">
        <span className="swatch" style={{ background: yarn.hex }} />
        {yarn.photo && <BlobImage className="yarn-photo small" blob={yarn.photo} alt="" />}
      </span>
      <span className="yarn-name">
        {yarn.number && <span className="palette-number">{yarn.number}</span>}
        {yarn.name}
      </span>
      <code>{yarn.hex}</code>
      <span className="hint">{details.join(' · ')}</span>
      <span className="yarn-actions">
        {onAddToStock && (
          <>
            <label className="grams-input">
              <input
                inputMode="decimal"
                value={grams}
                placeholder="g"
                aria-label={`Grams of ${yarn.name} bought`}
                aria-invalid={!gramsValid}
                onChange={(e) => setGrams(e.target.value)}
              />
              g
            </label>
            <button
              type="button"
              disabled={!gramsValid}
              onClick={() => onAddToStock(parsed ?? undefined)}
              title="You bought it: add it to Stock (it stays in the catalogue)"
            >
              Add to stock
            </button>
          </>
        )}
        <button type="button" onClick={onEdit}>
          Edit
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${yarn.name}`}>
          Remove
        </button>
      </span>
    </li>
  )
}
