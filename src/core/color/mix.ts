import { linearToOklab, oklabToLinear } from './convert'
import { deltaE } from './distance'
import type { OKLab } from '../types'

/**
 * How far (deltaE) colour c is from being a mix of p and q. Pixels along an edge between two
 * colours are such mixes. Depending on the software, mixing happens in linear light or on
 * the gamma-encoded sRGB values, so both are checked and the closer one counts.
 */
export function mixDistance(c: OKLab, p: OKLab, q: OKLab): number {
  return Math.min(deltaE(closestMix(c, p, q, LINEAR), c), deltaE(closestMix(c, p, q, GAMMA), c))
}

type Vec = { r: number; g: number; b: number }
type MixSpace = { from: (c: OKLab) => Vec; to: (v: Vec) => OKLab }

const encode = (x: number) =>
  Math.sign(x) *
  (Math.abs(x) <= 0.0031308 ? Math.abs(x) * 12.92 : 1.055 * Math.abs(x) ** (1 / 2.4) - 0.055)
const decode = (x: number) =>
  Math.sign(x) *
  (Math.abs(x) <= 0.04045 ? Math.abs(x) / 12.92 : ((Math.abs(x) + 0.055) / 1.055) ** 2.4)

/** Mixing in linear light (physically correct; some apps). */
const LINEAR: MixSpace = { from: oklabToLinear, to: linearToOklab }
/** Mixing the gamma-encoded sRGB values (most browsers and drawing apps, and fitToRug). */
const GAMMA: MixSpace = {
  from: (c) => {
    const v = oklabToLinear(c)
    return { r: encode(v.r), g: encode(v.g), b: encode(v.b) }
  },
  to: (v) => linearToOklab({ r: decode(v.r), g: decode(v.g), b: decode(v.b) }),
}

/** The mix of p and q closest to c: the nearest point on the straight line from p to q. */
function closestMix(c: OKLab, p: OKLab, q: OKLab, space: MixSpace): OKLab {
  const x = space.from(c)
  const u = space.from(p)
  const v = space.from(q)
  const d = { r: v.r - u.r, g: v.g - u.g, b: v.b - u.b }
  const length2 = d.r * d.r + d.g * d.g + d.b * d.b
  if (length2 === 0) return p
  // How far along the line the closest point lies (0 = p, 1 = q).
  const t = Math.min(
    1,
    Math.max(0, ((x.r - u.r) * d.r + (x.g - u.g) * d.g + (x.b - u.b) * d.b) / length2),
  )
  return space.to({ r: u.r + t * d.r, g: u.g + t * d.g, b: u.b + t * d.b })
}
