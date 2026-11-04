import { hexToRgb, oklabToSrgb, rgbToHex, srgbToOklab } from '../core/color/convert'
import { useState } from 'react'
import type { OKLab, PaletteEntry } from '../core/types'
import { yarnChoice } from './yarnChoice'

type Props = {
  label: string
  /** The chosen colour, or null for automatic. */
  value: OKLab | null
  onChange(colour: OKLab | null): void
  palette: PaletteEntry[]
  /** What "Automatic" currently means, e.g. "Colour 7 (Dark green)". */
  automatic: string
}

/** Choose a yarn colour: automatic, a palette colour (by number and name), or any other colour. */
export function YarnColourField({ label, value, onChange, palette, automatic }: Props) {
  // Remember "Other colour…" was picked, so a colour that matches a palette entry doesn't
  // make the select jump back to that entry (see yarnChoice).
  const [otherChosen, setOtherChosen] = useState(false)
  const choice = yarnChoice(value, palette, otherChosen)
  const hex = value ? rgbToHex(oklabToSrgb(value)) : '#000000'
  return (
    <div className="field">
      <label className="field">
        {label}
        <select
          value={choice}
          onChange={(e) => {
            const v = e.target.value
            setOtherChosen(v === 'other')
            if (v === 'auto') onChange(null)
            else if (v === 'other') onChange(srgbToOklab(hexToRgb(hex)))
            else onChange(palette.find((p) => String(p.number) === v)!.lab)
          }}
        >
          <option value="auto">Automatic: {automatic}</option>
          {palette.map((p) => (
            <option key={p.number} value={String(p.number)}>
              Colour {p.number} ({p.name})
            </option>
          ))}
          <option value="other">Other colour…</option>
        </select>
      </label>
      {choice === 'other' && (
        <input
          type="color"
          aria-label={`${label}: other colour`}
          value={hex}
          onChange={(e) => onChange(srgbToOklab(hexToRgb(e.target.value.toUpperCase())))}
        />
      )}
    </div>
  )
}
