import type { Yarn } from '../../core/types'

/** One clicked swatch: where on the chart, its colour and what the user typed for it. */
export type SwatchRow = {
  id: number
  at: { x: number; y: number }
  hex: string
  name: string
  number: string
}

export type SwatchImportErrors = {
  shop: string | null
  rows: { name: string | null; number: string | null }[]
}

/** Radius of the sampled patch: small, since swatches on a chart can be small; they are flat,
 *  so a few pixels are enough for the median to skip edge pixels and compression noise. */
export function swatchSampleRadius(chart: { width: number; height: number }): number {
  return Math.max(2, Math.round(Math.min(chart.width, chart.height) / 200))
}

/**
 * Inline messages for the import: a shop name is needed, every swatch needs a name, and a
 * number may not appear twice, neither in the import nor among the catalogue's yarns of the
 * same shop (shop names compared ignoring case). Empty numbers are fine.
 */
export function swatchImportErrors(
  rows: SwatchRow[],
  shop: string,
  existing: Yarn[],
): SwatchImportErrors {
  const shopKey = key(shop)
  const taken = catalogueNumbers(shop, existing)
  const uses = new Map<string, number>()
  for (const r of rows)
    if (r.number.trim()) uses.set(key(r.number), (uses.get(key(r.number)) ?? 0) + 1)

  return {
    shop: shopKey === '' ? 'Enter the shop or brand these yarns are from.' : null,
    rows: rows.map((r) => {
      const n = key(r.number)
      return {
        name: r.name.trim() === '' ? 'Give this colour a name.' : null,
        number:
          n === ''
            ? null
            : (uses.get(n) ?? 0) > 1
              ? `Number ${r.number.trim()} is used twice.`
              : taken.has(n)
                ? `The catalogue already has number ${r.number.trim()} from this shop.`
                : null,
      }
    }),
  }
}

/**
 * Fills every empty number with the lowest whole number not used yet, neither by another row
 * nor by the catalogue's yarns of the same shop, in row order. Numbers already typed stay.
 */
export function autoNumber(rows: SwatchRow[], shop: string, existing: Yarn[]): SwatchRow[] {
  const used = new Set([...catalogueNumbers(shop, existing), ...rows.map((r) => key(r.number))])
  let next = 1
  return rows.map((r) => {
    if (r.number.trim()) return r
    while (used.has(String(next))) next++
    used.add(String(next))
    return { ...r, number: String(next) }
  })
}

/** Checked rows as catalogue yarns (without ids), all from the given shop. */
export function swatchesToYarns(rows: SwatchRow[], shop: string): Omit<Yarn, 'id'>[] {
  return rows.map((r) => ({
    list: 'catalogue',
    name: r.name.trim(),
    number: r.number.trim(),
    hex: r.hex,
    shop: shop.trim(),
  }))
}

/** Numbers the catalogue already uses for this shop (compared like `key`). */
function catalogueNumbers(shop: string, existing: Yarn[]): Set<string> {
  return new Set(
    existing
      .filter((y) => y.list === 'catalogue' && key(y.shop ?? '') === key(shop) && y.number.trim())
      .map((y) => key(y.number)),
  )
}

const key = (text: string) => text.trim().toLowerCase()
