import { useState } from 'react'
import { cutSize } from '../../core/outline/cutLine'
import { useProject } from '../store/useProject'
import { labelOrNull } from '../viewGeometry'
import { PatternView } from '../views'
import { YarnColourField } from '../YarnColourField'

const METHOD_WORDS = {
  alpha: 'Used the transparency of the image.',
  'edge-colour': 'Used the colour along the edges of the image.',
  none: 'No background found: the whole image is the rug.',
}

/** Step 3 (shaped rugs): the cut line, the border, and which areas are background. */
export function OutlineStep() {
  const result = useProject((s) => s.result)
  const palette = useProject((s) => s.palette)
  const rug = useProject((s) => s.rug)
  const offsetMm = useProject((s) => s.offsetMm)
  const smoothMm = useProject((s) => s.smoothMm)
  const setRugEdge = useProject((s) => s.setRugEdge)
  const borderColour = useProject((s) => s.borderColour)
  const setBorderColour = useProject((s) => s.setBorderColour)
  const backgroundEdits = useProject((s) => s.backgroundEdits)
  const addBackgroundEdit = useProject((s) => s.addBackgroundEdit)
  const undoBackgroundEdit = useProject((s) => s.undoBackgroundEdit)
  const [highlight, setHighlight] = useState<number | null>(null)

  if (!result?.cut) return <p className="placeholder">Making the cut line…</p>
  const size = cutSize(result.cut)
  const border = result.roles.border === null ? null : palette[result.roles.border]
  const automatic =
    border && borderColour === null
      ? `Colour ${border.number} (${border.name})`
      : 'the colour along the art’s edge'

  /** A click on the pattern: art becomes background, a cut-out area becomes art again. */
  function toggleAt(at: { x: number; y: number }) {
    const onArt = labelOrNull(result!.map, at) !== null
    const artAt = { x: at.x - result!.artOriginMm.x, y: at.y - result!.artOriginMm.y }
    addBackgroundEdit({ at: artAt, background: onArt })
  }

  return (
    <div className="colours">
      <div className="views">
        <figure>
          <PatternView
            rug={result.pattern.rug}
            highlight={highlight}
            onHover={setHighlight}
            showCut
            onClickMm={toggleAt}
          />
          <figcaption>
            Dashed: where to cut. Click an area to remove it, or click a cut-out area to bring it
            back.
          </figcaption>
        </figure>
      </div>

      <section className="card settings">
        <h3>Rug edge</h3>
        {size && (
          <p>
            Finished size:{' '}
            <strong>
              {(size.widthMm / 10).toFixed(1)} × {(size.heightMm / 10).toFixed(1)} cm
            </strong>{' '}
            (the image fills {rug.widthMm / 10} × {rug.heightMm / 10} cm; the rug follows the art
            inside it, plus the border).
          </p>
        )}
        <label className="field">
          Border: {offsetMm / 10} cm
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={offsetMm}
            onChange={(e) => setRugEdge({ offsetMm: Number(e.target.value) })}
          />
        </label>
        <p className="hint">
          The band around the art, to glue and finish the edge without cutting into the design.
        </p>
        <label className="field">
          Round off tight inner corners: {smoothMm / 10} cm
          <input
            type="range"
            min={0}
            max={50}
            step={5}
            value={smoothMm}
            onChange={(e) => setRugEdge({ smoothMm: Number(e.target.value) })}
          />
        </label>
        <p className="hint">
          Gaps narrower than twice this are filled, so nothing is too tight to cut.
        </p>
        <YarnColourField
          label="Border yarn"
          value={borderColour}
          onChange={setBorderColour}
          palette={palette}
          automatic={automatic}
        />
      </section>

      <section className="card settings">
        <h3>Background</h3>
        <p>{METHOD_WORDS[result.background]}</p>
        {backgroundEdits.length > 0 && (
          <ul className="edits">
            {backgroundEdits.map((e, i) => (
              <li key={i}>
                {e.background ? 'Removed' : 'Brought back'} an area at {Math.round(e.at.x / 10)},{' '}
                {Math.round(e.at.y / 10)} cm{' '}
                <button type="button" className="link" onClick={() => undoBackgroundEdit(i)}>
                  undo
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
