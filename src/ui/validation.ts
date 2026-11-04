/** Largest rug side the app accepts (cm). */
export const MAX_RUG_CM = 500

/** A number of cm typed by the user: "120", "120.5" or "120,5" (decimal comma). Else null. */
export function parseCm(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

/** Inline messages for the rug size fields, or null where the value is fine. */
export function rugSizeErrors(
  widthCm: string,
  heightCm: string,
): { width: string | null; height: string | null } {
  return { width: sizeError('width', widthCm), height: sizeError('height', heightCm) }
}

function sizeError(name: 'width' | 'height', text: string): string | null {
  if (text.trim() === '') return `Enter the ${name} in cm.`
  const cm = parseCm(text)
  if (cm === null) return `Enter the ${name} as a number of cm, e.g. 120.`
  if (cm <= 0) return `The ${name} must be more than 0 cm.`
  if (cm > MAX_RUG_CM) return `The ${name} can be at most ${MAX_RUG_CM} cm.`
  return null
}
