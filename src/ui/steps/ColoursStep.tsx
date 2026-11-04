import { useEffect, useMemo, useRef, useState } from 'react'
import { deltaE } from '../../core/color/distance'
import { sampleColour } from '../../core/color/sample'
import { type ImageGrid, type LabelMap, type PaletteEntry, type RugSize } from '../../core/types'
import { describeAddedColour } from '../colourWords'
import { useProject } from '../store/useProject'
import { labelOrNull, mmAt, viewSize } from '../viewGeometry'
import { type HoverProps, PatternView } from '../views'
import { parseCm } from '../validation'

/** Step 2: the reduced result beside the original, the numbered palette, and the settings. */
export function ColoursStep() {
  const source = useProject((s) => s.source)
  const result = useProject((s) => s.result)
  const palette = useProject((s) => s.palette)
  const rug = useProject((s) => s.rug)
  const count = useProject((s) => s.count)
  const setCount = useProject((s) => s.setCount)
  const addPickedColour = useProject((s) => s.addPickedColour)
  const [highlight, setHighlight] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  // A colour was asked for: remember the palette before, to find the new colour in the result.
  const pending = useRef<{
    before: PaletteEntry[]
    resultBefore: typeof result
    countBefore: number | null
    picked: boolean
  } | null>(null)

  useEffect(() => {
    const p = pending.current
    // Only a new result counts; renaming or locking meanwhile changes the palette too.
    if (!p || result === p.resultBefore) return
    pending.current = null
    const added = palette.find((e) => !p.before.some((b) => deltaE(b.lab, e.lab) < 1))
    if (!added) {
      setNote('Nothing more worth adding: every part of the art already has a close colour.')
      setCount(p.countBefore)
      return
    }
    setNote(
      `${p.picked ? 'Picked from the image. ' : 'Added '}${describeAddedColour(added, palette)}`,
    )
    setHighlight(added.number - 1)
    const timer = setTimeout(() => setHighlight(null), 2500)
    return () => clearTimeout(timer)
  }, [palette, result, setCount])

  if (!source) return <p className="placeholder">Choose an image in Setup first.</p>
  if (!result) return <p className="placeholder">Making the pattern…</p>

  const shown = count ?? result.suggestedCount

  function addColour() {
    pending.current = { before: palette, resultBefore: result, countBefore: count, picked: false }
    setNote(null)
    setCount(shown + 1)
  }

  /** The eyedropper: undo the fit-and-centre of fitToRug to find the clicked image pixel. */
  function pick(at: { x: number; y: number }) {
    const { grid } = source!
    setPicking(false)
    // `at` is on the whole map; the art area starts at artOriginMm (after a shaped rug's border).
    const ax = at.x - result!.artOriginMm.x
    const ay = at.y - result!.artOriginMm.y
    const fit = Math.min(rug.widthMm / grid.width, rug.heightMm / grid.height) // mm per image px
    const x = (ax - (rug.widthMm - grid.width * fit) / 2) / fit
    const y = (ay - (rug.heightMm - grid.height * fit) / 2) / fit
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
      setNote('That spot is outside the image.')
      return
    }
    let colour
    try {
      colour = sampleColour(
        grid,
        { x, y },
        Math.max(2, Math.round(Math.min(grid.width, grid.height) / 200)),
      )
    } catch {
      setNote('That spot is transparent: pick a spot on the art.')
      return
    }
    const existing = palette.find((p) => deltaE(p.lab, colour) < 3)
    if (existing) {
      setNote(
        `That colour is already Colour ${existing.number} (${existing.name}); it is now locked.`,
      )
    } else {
      pending.current = { before: palette, resultBefore: result, countBefore: count, picked: true }
      setNote(null)
    }
    addPickedColour(colour)
  }

  return (
    <div className="colours">
      <div className="views">
        <figure>
          <OriginalView
            grid={source.grid}
            map={result.map}
            canvas={result.pattern.rug}
            art={rug}
            origin={result.artOriginMm}
            highlight={highlight}
            onHover={setHighlight}
            picking={picking}
            onPick={pick}
          />
          <figcaption>{picking ? 'Click a spot to add its colour' : 'Original'}</figcaption>
        </figure>
        <figure>
          <PatternView rug={result.pattern.rug} highlight={highlight} onHover={setHighlight} />
          <figcaption>Pattern</figcaption>
        </figure>
      </div>
      <div className="palette-column">
        <div className="palette-actions">
          <button type="button" onClick={addColour} disabled={shown >= 16}>
            Add a colour
          </button>
          <button type="button" onClick={() => setCount(shown - 1)} disabled={shown <= 1}>
            Remove a colour
          </button>
          <button type="button" aria-pressed={picking} onClick={() => setPicking(!picking)}>
            {picking ? 'Cancel picking' : 'Pick a colour from the image'}
          </button>
        </div>
        {note && (
          <p className="notice" role="status">
            {note}
          </p>
        )}
        <PaletteList palette={palette} highlight={highlight} onHover={setHighlight} />
      </div>
      <Settings />
    </div>
  )
}

/**
 * The original, placed the way the pipeline placed it: fitted and centred in the art area,
 * which sits at `origin` inside the whole map (`canvas`), with the other colours veiled.
 */
function OriginalView({
  grid,
  map,
  canvas,
  art,
  origin,
  highlight,
  onHover,
  picking,
  onPick,
}: {
  grid: ImageGrid
  map: LabelMap
  canvas: RugSize
  art: RugSize
  origin: { x: number; y: number }
  picking: boolean
  onPick(at: { x: number; y: number }): void
} & HoverProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const rug = canvas
  const size = viewSize(canvas)
  const image = useMemo(() => toCanvas(grid), [grid])

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, size.width, size.height)
    // Fit and centre in the art area like fitToRug (canvas pixels: mm × size.scale).
    const areaW = art.widthMm * size.scale
    const areaH = art.heightMm * size.scale
    const fit = Math.min(areaW / grid.width, areaH / grid.height)
    const w = grid.width * fit
    const h = grid.height * fit
    const x = origin.x * size.scale + (areaW - w) / 2
    const y = origin.y * size.scale + (areaH - h) / 2
    ctx.drawImage(image, x, y, w, h)
    if (highlight !== null) ctx.drawImage(veil(map, highlight), 0, 0, size.width, size.height)
  }, [image, grid, map, highlight, size.width, size.height, size.scale, art, origin])

  return (
    <canvas
      ref={ref}
      className={picking ? 'view picking' : 'view'}
      width={size.width}
      height={size.height}
      role="img"
      aria-label="The original image"
      onMouseMove={(e) => onHover(labelOrNull(map, mmAt(e, rug)))}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => picking && onPick(mmAt(e, rug))}
    />
  )
}

function toCanvas(grid: ImageGrid): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = grid.width
  c.height = grid.height
  c.getContext('2d')!.putImageData(
    new ImageData(new Uint8ClampedArray(grid.data), grid.width, grid.height),
    0,
    0,
  )
  return c
}

/** A light veil over every pixel that is not `label`, at the colour map's resolution. */
function veil(map: LabelMap, label: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = map.width
  c.height = map.height
  const data = new Uint8ClampedArray(map.width * map.height * 4)
  for (let p = 0; p < map.labels.length; p++) {
    if (map.labels[p] === label) continue
    data[p * 4] = 246
    data[p * 4 + 1] = 245
    data[p * 4 + 2] = 242
    data[p * 4 + 3] = 210
  }
  c.getContext('2d')!.putImageData(new ImageData(data, map.width, map.height), 0, 0)
  return c
}

function PaletteList({ palette, highlight, onHover }: { palette: PaletteEntry[] } & HoverProps) {
  const toggleLock = useProject((s) => s.toggleLock)
  const renameColour = useProject((s) => s.renameColour)
  const mergeColour = useProject((s) => s.mergeColour)
  const merges = useProject((s) => s.merges)
  const undoMerge = useProject((s) => s.undoMerge)
  const intoName = (lab: PaletteEntry['lab']) => {
    const p = palette.find((e) => deltaE(e.lab, lab) < 10)
    return p ? `Colour ${p.number} (${p.name})` : 'a colour that is no longer there'
  }
  return (
    <section className="card palette">
      <h3>Colours</h3>
      <ol>
        {palette.map((p, label) => (
          <li
            key={p.number}
            className={highlight === label ? 'highlighted' : undefined}
            onMouseEnter={() => onHover(label)}
            onMouseLeave={() => onHover(null)}
          >
            <span className="swatch" style={{ background: p.hex }} aria-hidden="true" />
            <span className="palette-number">{p.number}</span>
            <input
              aria-label={`Name of colour ${p.number}`}
              value={p.name}
              onChange={(e) => renameColour(p.number, e.target.value)}
            />
            <code>{p.hex}</code>
            <label className="lock">
              <input type="checkbox" checked={p.locked} onChange={() => toggleLock(p.number)} />
              Locked
            </label>
            <select
              aria-label={`Merge colour ${p.number} into another colour`}
              value=""
              onChange={(e) => mergeColour(p.number, Number(e.target.value))}
            >
              <option value="">Merge into…</option>
              {palette
                .filter((o) => o.number !== p.number)
                .map((o) => (
                  <option key={o.number} value={o.number}>
                    Colour {o.number} ({o.name})
                  </option>
                ))}
            </select>
          </li>
        ))}
      </ol>
      {merges.length > 0 && (
        <div className="merges">
          <h4>Merged</h4>
          <ul>
            {merges.map((m, i) => (
              <li key={i}>
                <span
                  className="swatch small"
                  style={{ background: m.fromHex }}
                  aria-hidden="true"
                />
                {m.fromName} ({m.fromHex}) → {intoName(m.into)}{' '}
                <button type="button" className="link" onClick={() => undoMerge(i)}>
                  undo
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="hint">Hover a colour, or a spot on either picture, to see where it sits.</p>
    </section>
  )
}

function Settings() {
  const count = useProject((s) => s.count)
  const setCount = useProject((s) => s.setCount)
  const result = useProject((s) => s.result!)
  const palette = useProject((s) => s.palette)
  const minDetailMm = useProject((s) => s.minDetailMm)
  const setMinDetail = useProject((s) => s.setMinDetail)
  const thicken = useProject((s) => s.thicken)
  const toggleThicken = useProject((s) => s.toggleThicken)
  const outlines = useProject((s) => s.outlines)
  const setOutlines = useProject((s) => s.setOutlines)

  const [detailCm, setDetailCm] = useState(String(minDetailMm / 10))
  const [outlineCm, setOutlineCm] = useState(String(outlines.widthMm / 10))
  const suggested = result.suggestedCount
  const shown = count ?? suggested
  const name = (label: number) =>
    palette[label] ? `Colour ${palette[label].number} (${palette[label].name})` : ''
  const thinByLabel = new Map<number, number>()
  for (const t of result.thin)
    thinByLabel.set(t.label, Math.min(thinByLabel.get(t.label) ?? Infinity, t.widthMm))
  const isThickened = (label: number) =>
    palette[label] !== undefined && thicken.some((c) => deltaE(c, palette[label].lab) < 3)
  const darkest = palette.length ? palette.reduce((a, b) => (b.lab.L < a.lab.L ? b : a)) : null
  const outlineColour = outlines.colour
    ? palette.find((p) => deltaE(p.lab, outlines.colour!) < 3)
    : null

  return (
    <section className="card settings">
      <h3>Settings</h3>

      <label className="field">
        Number of colours: {shown} {count === null && '(suggested)'}
        <input
          type="range"
          min={1}
          max={16}
          value={shown}
          list="suggested-count"
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <datalist id="suggested-count">
          <option value={suggested} label="suggested" />
        </datalist>
      </label>
      <p className="hint">
        This art has {suggested} colours.{' '}
        {result.mergedAway > 0 &&
          `${palette.length} in the pattern (${result.mergedAway} merged). `}
        {count !== null && (
          <button type="button" className="link" onClick={() => setCount(null)}>
            Use {suggested}
          </button>
        )}
      </p>

      <label className="field">
        Smallest detail (cm)
        <input
          inputMode="decimal"
          value={detailCm}
          onChange={(e) => {
            setDetailCm(e.target.value)
            const cm = parseCm(e.target.value)
            if (cm !== null && cm > 0 && cm <= 20) setMinDetail(cm * 10)
          }}
        />
      </label>
      <p className="hint">
        Areas smaller than this square are merged into a neighbour; thinner lines are flagged.
      </p>

      {thinByLabel.size === 0 && (
        <p className="hint">No lines thinner than {minDetailMm / 10} cm.</p>
      )}
      {thinByLabel.size > 0 && (
        <div className="warnings">
          <h4>Too thin to tuft</h4>
          <ul>
            {[...thinByLabel].map(([label, widthMm]) => (
              <li key={label}>
                {name(label)}: lines about {Math.round(widthMm)} mm wide, thinner than {minDetailMm}{' '}
                mm.{' '}
                <button type="button" onClick={() => toggleThicken(palette[label].lab)}>
                  Thicken to {minDetailMm} mm
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {palette.some((_, label) => isThickened(label)) && (
        <p className="hint">
          Thickened:{' '}
          {palette.map((p, label) =>
            isThickened(label) ? (
              <button
                key={p.number}
                type="button"
                className="link"
                onClick={() => toggleThicken(p.lab)}
              >
                undo {name(label)}
              </button>
            ) : null,
          )}
        </p>
      )}

      <h4>Separation outlines</h4>
      {result.outlineSuggestion !== null && !outlines.enabled && (
        <p className="hint">
          This art already has outlines in {name(result.outlineSuggestion)}. You can thicken them,
          or turn on separation outlines.
        </p>
      )}
      <label className="choice">
        <input
          type="checkbox"
          checked={outlines.enabled}
          onChange={(e) => setOutlines({ enabled: e.target.checked })}
        />
        Add lines between areas
      </label>
      {outlines.enabled && (
        <div className="field-row">
          <label className="field">
            Width (cm)
            <input
              inputMode="decimal"
              value={outlineCm}
              onChange={(e) => {
                setOutlineCm(e.target.value)
                const cm = parseCm(e.target.value)
                if (cm !== null && cm > 0 && cm <= 10) setOutlines({ widthMm: cm * 10 })
              }}
            />
          </label>
          <label className="field">
            Yarn
            <select
              value={outlineColour ? String(outlineColour.number) : 'darkest'}
              onChange={(e) =>
                setOutlines({
                  colour:
                    e.target.value === 'darkest'
                      ? null
                      : palette.find((p) => String(p.number) === e.target.value)!.lab,
                })
              }
            >
              <option value="darkest">
                Darkest colour{darkest ? ` (Colour ${darkest.number}, ${darkest.name})` : ''}
              </option>
              {palette.map((p) => (
                <option key={p.number} value={String(p.number)}>
                  Colour {p.number} ({p.name})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Where
            <select
              value={outlines.where}
              onChange={(e) => setOutlines({ where: e.target.value as 'all' | 'outer' })}
            >
              <option value="all">Between all areas and around the edge</option>
              <option value="outer">Only around the edge</option>
            </select>
          </label>
        </div>
      )}
    </section>
  )
}
