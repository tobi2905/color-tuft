import { oklabToSrgb, rgbToHex } from '../../core/color/convert'
import { suggestYarns, yarnsOnlyColours } from '../../core/yarn/match'
import type { OKLab } from '../../core/types'
import { useProject } from '../store/useProject'
import { useYarns } from '../store/yarnStore'

/**
 * Setup: find the art's colours freely, or use only owned yarns. Choosing "my yarns" maps
 * each colour found to its nearest stock yarn and locks those, so the pattern uses exactly them.
 * `children` is the colour count field, shown in the free mode.
 */
export function YarnsOnlyChoice({ children }: { children: React.ReactNode }) {
  const yarnsOnly = useProject((s) => s.yarnsOnly)
  const setYarnsOnly = useProject((s) => s.setYarnsOnly)
  const palette = useProject((s) => s.palette)
  const yarns = useYarns((s) => s.yarns)
  const stock = yarns.filter((y) => y.list === 'stock')

  const unavailable =
    stock.length === 0
      ? 'Add the yarns you own in step 5 (Yarn) first.'
      : palette.length === 0
        ? 'Upload an image first: its colours are matched to your yarns.'
        : null

  function chooseFrom(from: OKLab[]) {
    const chosen = yarnsOnlyColours(from, stock)
    setYarnsOnly({
      from,
      yarns: chosen.map((c) => ({ yarnId: c.yarn.id, name: c.yarn.name, lab: c.lab })),
    })
  }

  return (
    <>
      <label className="choice">
        <input
          type="radio"
          name="colours"
          checked={!yarnsOnly}
          onChange={() => setYarnsOnly(null)}
        />
        Find the art's colours
      </label>
      <label className="choice">
        <input
          type="radio"
          name="colours"
          checked={yarnsOnly !== null}
          disabled={unavailable !== null && !yarnsOnly}
          onChange={() => chooseFrom(palette.map((p) => p.lab))}
        />
        Use only my yarns
      </label>
      {!yarnsOnly && unavailable && <p className="hint">{unavailable}</p>}
      {yarnsOnly ? <YarnsOnlySummary onRechoose={() => chooseFrom(yarnsOnly.from)} /> : children}
    </>
  )
}

/** How the art's colours were matched: how many yarns, and what doesn't fit well. */
function YarnsOnlySummary({ onRechoose }: { onRechoose(): void }) {
  const yarnsOnly = useProject((s) => s.yarnsOnly)!
  const yarns = useYarns((s) => s.yarns)
  const stockCount = yarns.filter((y) => y.list === 'stock').length
  const suggestions = suggestYarns(yarnsOnly.from, yarns)
  const unmatched = yarnsOnly.from.filter((_, i) => suggestions[i].yarnId === null)
  const noMatch = unmatched.length
  const shared = [
    ...new Set(
      suggestions
        .filter((s) => s.collision)
        .map((s) => yarns.find((y) => y.id === s.yarnId)?.name ?? ''),
    ),
  ]
  const n = yarnsOnly.yarns.length
  return (
    <div className="yarns-only">
      <p className="hint">
        Uses {n} of your {stockCount} {stockCount === 1 ? 'yarn' : 'yarns'}:{' '}
        {yarnsOnly.yarns.map((y) => y.name).join(', ')}.
      </p>
      {noMatch > 0 && (
        <p className="notice">
          {noMatch === 1 ? '1 colour of the art has' : `${noMatch} colours of the art have`} no
          close yarn and {noMatch === 1 ? 'uses' : 'use'} the nearest one, which looks noticeably
          different:{' '}
          {unmatched.map((lab) => {
            const hex = rgbToHex(oklabToSrgb(lab))
            return (
              <span
                key={hex}
                className="swatch small inline"
                style={{ background: hex }}
                title={hex}
              />
            )
          })}
        </p>
      )}
      {shared.length > 0 && (
        <p className="notice">
          Clearly different colours of the art share one yarn: {shared.join(', ')}. A yarn closer to
          one of them would keep them apart.
        </p>
      )}
      <button type="button" onClick={onRechoose}>
        Match again
      </button>
      <p className="hint">After changing your yarns, match again to use them.</p>
    </div>
  )
}
