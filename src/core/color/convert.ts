import type { OKLab, RGB } from '../types'

const HEX_PATTERN = /^#[0-9a-f]{6}$/i

/** '#RRGGBB' (any case) to 0–255 channels. Throws on anything else. */
export function hexToRgb(hex: string): RGB {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`Not a colour code: "${hex}". Expected #RRGGBB.`)
  }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

/** 0–255 channels to '#RRGGBB' in upper case. */
export function rgbToHex(c: RGB): string {
  const part = (v: number) => v.toString(16).padStart(2, '0')
  return `#${part(c.r)}${part(c.g)}${part(c.b)}`.toUpperCase()
}

// --- sRGB gamma: stored 0–255 values <-> linear light 0–1 ---

/** Undo sRGB's gamma encoding: 0–255 to linear light, where 0.5 means half the light. */
function toLinear(v: number): number {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Re-apply sRGB's gamma encoding: linear light to 0–255, rounded and clamped. */
function fromLinear(x: number): number {
  const c = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
}

// --- OKLab (Björn Ottosson, 2020): https://bottosson.github.io/posts/oklab/ ---

export function srgbToOklab(c: RGB): OKLab {
  const r = toLinear(c.r)
  const g = toLinear(c.g)
  const b = toLinear(c.b)

  // Linear RGB -> LMS: roughly how strongly each of the eye's three cone types responds.
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  // Cube root: compresses strong responses the way perception does.
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  // LMS -> lightness and the two colour axes.
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

/** The exact reverse of srgbToOklab. Colours a screen can't show are clamped to 0–255. */
export function oklabToSrgb(c: OKLab): RGB {
  const l_ = c.L + 0.3963377774 * c.a + 0.2158037573 * c.b
  const m_ = c.L - 0.1055613458 * c.a - 0.0638541728 * c.b
  const s_ = c.L - 0.0894841775 * c.a - 1.291485548 * c.b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}
