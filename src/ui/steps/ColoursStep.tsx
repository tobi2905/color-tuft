import { useEffect, useMemo, useRef, useState } from 'react'
import { deltaE } from '../../core/color/distance'
import { labelAt } from '../../core/labelMap'
import {
  type ImageGrid,
  type LabelMap,
  NO_LABEL,
  type PaletteEntry,
  type RugSize,
} from '../../core/types'
import { drawPattern } from '../../render/patternCanvas'
import { useProject } from '../store/useProject'
import { parseCm } from '../validation'

/** The two views are drawn with their long side this many CSS pixels (times the screen density). */
const VIEW_PX = 640

/** Step 2: the reduced result beside the original, the numbered palette, and the settings. */
export function ColoursStep() {
  const source = useProject((s) => s.source)
  const result = useProject((s) => s.result)
  const palette = useProject((s) => s.palette)
  const rug = useProject((s) => s.rug)
  const [highlight, setHighlight] = useState<number | null>(null)

  if (!source) return <p className="placeholder">Choose an image in Setup first.</p>
  if (!result) return <p className="placeholder">Making the pattern…</p>

  return (
    <div className="colours">
      <div className="views">
        <figure>
          <OriginalView
            grid={source.grid}
            map={result.map}
            rug={rug}
            highlight={highlight}
            onHover={setHighlight}
          />
          <figcaption>Original</figcaption>
        </figure>
        <figure>
          <PatternView rug={rug} highlight={highlight} onHover={setHighlight} />
          <figcaption>Pattern</figcaption>
        </figure>
      </div>
      <PaletteList palette={palette} highlight={highlight} onHover={setHighlight} />
      <Settings />
    </div>
  )
}

/** Canvas size for a rug: long side VIEW_PX CSS pixels, sharp on high-density screens. */
function viewSize(rug: RugSize) {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const long = Math.max(rug.widthMm, rug.heightMm)
  const scale = (VIEW_PX * dpr) / long // canvas pixels per mm
  return { width: Math.round(rug.widthMm * scale), height: Math.round(rug.heightMm * scale), scale }
}

/** Mouse position on a canvas, in rug mm. */
function mmAt(e: React.MouseEvent<HTMLCanvasElement>, rug: RugSize) {
  const r = e.currentTarget.getBoundingClientRect()
  return {
    x: ((e.clientX - r.left) / r.width) * rug.widthMm,
    y: ((e.clientY - r.top) / r.height) * rug.heightMm,
  }
}

type HoverProps = { highlight: number | null; onHover(label: number | null): void }

function PatternView({ rug, highlight, onHover }: { rug: RugSize } & HoverProps) {
  const pattern = useProject((s) => s.result!.pattern)
  const map = useProject((s) => s.result!.map)
  const palette = useProject((s) => s.palette)
  const ref = useRef<HTMLCanvasElement>(null)
  const size = viewSize(rug)

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx)
      drawPattern(ctx, pattern, palette, {
        scale: size.scale,
        numbers: true,
        outlines: true,
        highlight,
      })
  }, [pattern, palette, highlight, size.scale])

  return (
    <canvas
      ref={ref}
      className="view"
      width={size.width}
      height={size.height}
      role="img"
      aria-label="The pattern, each area numbered with its colour"
      onMouseMove={(e) => onHover(labelOrNull(map, mmAt(e, rug)))}
      onMouseLeave={() => onHover(null)}
    />
  )
}

/** The original, placed in the rug the way the pipeline placed it, with the other colours veiled. */
function OriginalView({
  grid,
  map,
  rug,
  highlight,
  onHover,
}: { grid: ImageGrid; map: LabelMap; rug: RugSize } & HoverProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const size = viewSize(rug)
  const image = useMemo(() => toCanvas(grid), [grid])

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, size.width, size.height)
    // Fit and centre like fitToRug.
    const fit = Math.min(size.width / grid.width, size.height / grid.height)
    const w = grid.width * fit
    const h = grid.height * fit
    ctx.drawImage(image, (size.width - w) / 2, (size.height - h) / 2, w, h)
    if (highlight !== null) ctx.drawImage(veil(map, highlight), 0, 0, size.width, size.height)
  }, [image, grid, map, highlight, size.width, size.height])

  return (
    <canvas
      ref={ref}
      className="view"
      width={size.width}
      height={size.height}
      role="img"
      aria-label="The original image"
      onMouseMove={(e) => onHover(labelOrNull(map, mmAt(e, rug)))}
      onMouseLeave={() => onHover(null)}
    />
  )
}

function labelOrNull(map: LabelMap, pt: { x: number; y: number }) {
  const label = labelAt(map, pt)
  return label === NO_LABEL ? null : label
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
          </li>
        ))}
      </ol>
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
