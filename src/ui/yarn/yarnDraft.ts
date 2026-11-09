import type { Yarn } from '../../core/types'
import { parseDecimal } from '../validation'

/** The yarn form's fields as typed (all text), before they are checked. */
export type YarnDraft = {
  name: string
  number: string
  hex: string
  gramsOnHand: string
  coneWeightG: string
  shop: string
}

export type YarnDraftErrors = Record<'name' | 'hex' | 'gramsOnHand' | 'coneWeightG', string | null>

export const emptyDraft = (): YarnDraft => ({
  name: '',
  number: '',
  hex: '#808080',
  gramsOnHand: '',
  coneWeightG: '',
  shop: '',
})

export function draftFromYarn(yarn: Yarn): YarnDraft {
  const text = (n?: number) => (n === undefined ? '' : String(n))
  return {
    name: yarn.name,
    number: yarn.number,
    hex: yarn.hex,
    gramsOnHand: text(yarn.gramsOnHand),
    coneWeightG: text(yarn.coneWeightG),
    shop: yarn.shop ?? '',
  }
}

/** Inline messages for the form, or null where the value is fine. Only name and colour are required. */
export function yarnDraftErrors(d: YarnDraft): YarnDraftErrors {
  return {
    name: d.name.trim() === '' ? 'Give the yarn a name.' : null,
    hex: normaliseHex(d.hex) === null ? 'Enter a colour code like #D62828.' : null,
    gramsOnHand: gramsError(d.gramsOnHand, true),
    coneWeightG: gramsError(d.coneWeightG, false),
  }
}

/** A checked draft as a yarn (without id). Empty optional fields are left out. */
export function draftToYarn(d: YarnDraft, list: Yarn['list']): Omit<Yarn, 'id'> {
  const grams = parseDecimal(d.gramsOnHand)
  const cone = parseDecimal(d.coneWeightG)
  return {
    list,
    name: d.name.trim(),
    number: d.number.trim(),
    hex: normaliseHex(d.hex)!,
    ...(grams !== null ? { gramsOnHand: grams } : {}),
    ...(cone !== null ? { coneWeightG: cone } : {}),
    ...(d.shop.trim() ? { shop: d.shop.trim() } : {}),
  }
}

/** '#d62828' or 'd62828' to '#D62828'; anything else null. */
export function normaliseHex(text: string): string | null {
  const t = text.trim().replace(/^#/, '')
  return /^[0-9a-f]{6}$/i.test(t) ? `#${t.toUpperCase()}` : null
}

/** Grams are optional; on hand may be 0, a cone weight may not. */
function gramsError(text: string, zeroAllowed: boolean): string | null {
  if (text.trim() === '') return null
  const g = parseDecimal(text)
  if (g === null) return 'Enter a number of grams, e.g. 400.'
  if (zeroAllowed && g < 0) return "Can't be less than 0 g."
  if (!zeroAllowed && g <= 0) return 'Must be more than 0 g.'
  return null
}
