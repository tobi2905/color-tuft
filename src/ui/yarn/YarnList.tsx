import { useState } from 'react'
import type { Yarn } from '../../core/types'
import { BlobImage } from '../BlobImage'
import { useYarns } from '../store/yarnStore'
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
  const moveToStock = useYarns((s) => s.moveToStock)
  const [list, setList] = useState<Yarn['list']>('stock')
  // 'new' = the add form is open; an id = that yarn is being edited.
  const [editing, setEditing] = useState<string | null>(null)
  const tab = TABS.find((t) => t.list === list)!
  const shown = yarns.filter((y) => y.list === list)

  function switchTo(next: Yarn['list']) {
    setList(next)
    setEditing(null)
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
        {shown.length === 0 && editing !== 'new' && <p className="hint">{tab.empty}</p>}
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
                onEdit={() => setEditing(y.id)}
                onRemove={() => removeYarn(y.id)}
                onMoveToStock={list === 'catalogue' ? () => moveToStock(y.id) : undefined}
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
        ) : (
          <div className="form-actions">
            <button type="button" onClick={() => setEditing('new')}>
              Add a yarn
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function YarnRow({
  yarn,
  onEdit,
  onRemove,
  onMoveToStock,
}: {
  yarn: Yarn
  onEdit(): void
  onRemove(): void
  onMoveToStock?(): void
}) {
  const details = [
    yarn.list === 'stock' && yarn.gramsOnHand !== undefined
      ? `${yarn.gramsOnHand} g on hand`
      : null,
    yarn.coneWeightG !== undefined ? `${yarn.coneWeightG} g cones` : null,
    yarn.shop ?? null,
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
        {onMoveToStock && (
          <button type="button" onClick={onMoveToStock} title="You bought it: move it to Stock">
            Move to stock
          </button>
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
