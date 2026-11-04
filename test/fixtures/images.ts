/**
 * Generated test images. Each one has an exactly known answer (how many colours, which
 * area, how wide a line), so tests can check results precisely. No real artwork in the repo.
 */
import { oklabToSrgb } from '../../src/core/color/convert'
import type { ImageGrid, Pt, RGB } from '../../src/core/types'
import { seededRandom } from './random'

/** The colours the fixtures use, so tests can refer to them by name. */
export const FIXTURE = {
  gold: { r: 255, g: 215, b: 0 },
  dark: { r: 27, g: 27, b: 27 },
  white: { r: 255, g: 255, b: 255 },
  black: { r: 0, g: 0, b: 0 },
  red: { r: 214, g: 40, b: 40 },
  yellow: { r: 255, g: 200, b: 60 },
  navy: { r: 20, g: 40, b: 110 },
  green: { r: 40, g: 160, b: 70 },
  blue: { r: 40, g: 100, b: 220 },
} satisfies Record<string, RGB>

/** Circles in the fixtures have this radius, as a share of the image size. */
export const CIRCLE_RADIUS_SHARE = 0.4

// --- helpers ---

/** A square image where each pixel's colour comes from its centre point. */
function makeImage(sizePx: number, colourAt: (x: number, y: number) => RGB): ImageGrid {
  const data = new Uint8ClampedArray(sizePx * sizePx * 4)
  for (let y = 0; y < sizePx; y++) {
    for (let x = 0; x < sizePx; x++) {
      const c = colourAt(x + 0.5, y + 0.5)
      const i = (y * sizePx + x) * 4
      data[i] = c.r
      data[i + 1] = c.g
      data[i + 2] = c.b
      data[i + 3] = 255
    }
  }
  return { width: sizePx, height: sizePx, data }
}

/** Centre of the image, placed on a pixel centre so the middle row and column are exact. */
function centreOf(sizePx: number): number {
  return Math.floor(sizePx / 2) + 0.5
}

function insideTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const side = (u: Pt, v: Pt) => (v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x)
  const s1 = side(a, b)
  const s2 = side(b, c)
  const s3 = side(c, a)
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)
}

const mid = (u: Pt, v: Pt): Pt => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 })

/** Shrink an equilateral triangle about its centre so each side moves inward by `insetPx`. */
function shrinkTriangle(tri: [Pt, Pt, Pt], insetPx: number): [Pt, Pt, Pt] {
  const centre = {
    x: (tri[0].x + tri[1].x + tri[2].x) / 3,
    y: (tri[0].y + tri[1].y + tri[2].y) / 3,
  }
  const side = Math.hypot(tri[1].x - tri[0].x, tri[1].y - tri[0].y)
  const inradius = side / (2 * Math.sqrt(3))
  const s = 1 - insetPx / inradius
  return tri.map((p) => ({
    x: centre.x + (p.x - centre.x) * s,
    y: centre.y + (p.y - centre.y) * s,
  })) as [Pt, Pt, Pt]
}

// --- images ---

/**
 * Three gold triangles on a dark background (2 colours). A small gap separates the
 * triangles: on a pixel grid, tips that merely "touch" would merge or split depending on
 * the size, so the gap makes them reliably 3 separate regions.
 */
export function triforce(sizePx: number): ImageGrid {
  const side = 0.9 * sizePx
  const height = (side * Math.sqrt(3)) / 2
  const top = (sizePx - height) / 2
  const apex = { x: sizePx / 2, y: top }
  const bottomLeft = { x: sizePx / 2 - side / 2, y: top + height }
  const bottomRight = { x: sizePx / 2 + side / 2, y: top + height }
  const left = mid(apex, bottomLeft)
  const right = mid(apex, bottomRight)
  const bottom = mid(bottomLeft, bottomRight)

  const gapPx = Math.max(2, 0.01 * sizePx)
  const triangles = [
    shrinkTriangle([apex, left, right], gapPx / 2),
    shrinkTriangle([left, bottomLeft, bottom], gapPx / 2),
    shrinkTriangle([right, bottom, bottomRight], gapPx / 2),
  ]
  return makeImage(sizePx, (x, y) =>
    triangles.some(([a, b, c]) => insideTriangle({ x, y }, a, b, c)) ? FIXTURE.gold : FIXTURE.dark,
  )
}

/** A red disk (radius CIRCLE_RADIUS_SHARE × size) on white. */
export function circle(sizePx: number): ImageGrid {
  const c = centreOf(sizePx)
  const r = CIRCLE_RADIUS_SHARE * sizePx
  return makeImage(sizePx, (x, y) => (Math.hypot(x - c, y - c) < r ? FIXTURE.red : FIXTURE.white))
}

/**
 * A disk shading from light blue in the middle to dark blue at the rim, in `steps` solid
 * rings, on white. Many steps look like a smooth gradient; the pipeline must turn it into
 * a few bands.
 */
export function gradientCircle(sizePx: number, steps: number): ImageGrid {
  const c = centreOf(sizePx)
  const r = CIRCLE_RADIUS_SHARE * sizePx
  const ringColours = Array.from({ length: steps }, (_, k) => {
    const t = steps === 1 ? 0 : k / (steps - 1)
    return oklabToSrgb({ L: 0.9 - 0.55 * t, a: -0.02, b: -0.08 })
  })
  return makeImage(sizePx, (x, y) => {
    const d = Math.hypot(x - c, y - c)
    if (d >= r) return FIXTURE.white
    return ringColours[Math.min(steps - 1, Math.floor((d / r) * steps))]
  })
}

/**
 * Line art: a black ring `lineWidthPx` wide around white space, with a red disk in the
 * middle, on white. The white inside the ring is part of the art, not background.
 */
export function thinOutline(sizePx: number, lineWidthPx: number): ImageGrid {
  const c = centreOf(sizePx)
  const ringRadius = 0.35 * sizePx
  const dotRadius = 0.15 * sizePx
  return makeImage(sizePx, (x, y) => {
    const d = Math.hypot(x - c, y - c)
    // Half-open band: exactly lineWidthPx pixels wide along the middle row.
    if (d >= ringRadius - lineWidthPx / 2 && d < ringRadius + lineWidthPx / 2) return FIXTURE.black
    if (d < dotRadius) return FIXTURE.red
    return FIXTURE.white
  })
}

/**
 * A big yellow face on white with one tiny navy eye covering `eyeShare` of the image
 * (e.g. 0.005 = 0.5%). Plain k-means tends to swallow the eye; the palette must keep it.
 */
export function smallEye(sizePx: number, eyeShare: number): ImageGrid {
  const c = centreOf(sizePx)
  const faceRadius = 0.45 * sizePx
  const eyeRadius = Math.sqrt((eyeShare * sizePx * sizePx) / Math.PI)
  const eye = { x: c - 0.15 * sizePx, y: c - 0.1 * sizePx }
  return makeImage(sizePx, (x, y) => {
    if (Math.hypot(x - eye.x, y - eye.y) < eyeRadius) return FIXTURE.navy
    if (Math.hypot(x - c, y - c) < faceRadius) return FIXTURE.yellow
    return FIXTURE.white
  })
}

/** A 3 × 2 grid of six clearly different colours, filling the whole image. */
export function sixColours(sizePx: number): ImageGrid {
  const tiles = [
    FIXTURE.red,
    FIXTURE.green,
    FIXTURE.blue,
    FIXTURE.gold,
    FIXTURE.black,
    FIXTURE.white,
  ]
  return makeImage(sizePx, (x, y) => {
    const col = Math.min(2, Math.floor((x / sizePx) * 3))
    const row = Math.min(1, Math.floor((y / sizePx) * 2))
    return tiles[row * 3 + col]
  })
}

// --- modifiers (return a new image; the input is never changed) ---

/**
 * Adds seeded random noise of up to ±amplitude to each colour channel, like the speckle
 * of a low-quality JPEG. Alpha is untouched.
 */
export function withJpegNoise(img: ImageGrid, amplitude: number, seed: number): ImageGrid {
  const random = seededRandom(seed)
  const data = new Uint8ClampedArray(img.data)
  for (let i = 0; i < data.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      // Uint8ClampedArray rounds and clamps to 0–255 on its own.
      data[i + ch] = data[i + ch] + (random() * 2 - 1) * amplitude
    }
  }
  return { width: img.width, height: img.height, data }
}

/**
 * Turns the background (the colour of the top-left pixel) transparent, with a soft,
 * anti-aliased edge about 2 × featherPx wide, like a PNG exported from a drawing app.
 *
 * - Alpha is the art's coverage around each pixel, so it is near 128 right at the edge.
 * - Semi-transparent pixels carry the colour of the nearest art pixel.
 * - Fully transparent pixels keep the old background colour. Code that ignores alpha would
 *   see that colour as a "halo"; code that respects alpha never sees it.
 */
export function withSoftAlpha(img: ImageGrid, featherPx: number): ImageGrid {
  const { width: w, height: h } = img
  const src = img.data
  const isArt = (p: number) =>
    src[p * 4] !== src[0] || src[p * 4 + 1] !== src[1] || src[p * 4 + 2] !== src[2]

  const art = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) art[p] = isArt(p) ? 1 : 0

  // Coverage: average of the art mask over a (2r + 1)² box, as a horizontal then a vertical pass.
  const r = Math.max(1, Math.round(featherPx))
  const coverage = boxBlur(boxBlur(art, w, h, r, true), w, h, r, false)

  const data = new Uint8ClampedArray(src)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const alpha = Math.round(coverage[p] * 255)
      data[p * 4 + 3] = alpha
      if (alpha > 0 && !art[p]) {
        const q = nearestArtPixel(art, w, h, x, y, r)
        if (q >= 0) data.set(src.subarray(q * 4, q * 4 + 3), p * 4)
      }
    }
  }
  return { width: w, height: h, data }
}

/** One pass of a box blur, along rows (horizontal) or columns. Pixels outside the image count as 0. */
function boxBlur(
  src: Float32Array,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
): Float32Array {
  const out = new Float32Array(w * h)
  const lines = horizontal ? h : w
  const length = horizontal ? w : h
  for (let line = 0; line < lines; line++) {
    const at = (k: number) => (horizontal ? line * w + k : k * w + line)
    let sum = 0
    for (let k = 0; k <= Math.min(r, length - 1); k++) sum += src[at(k)]
    for (let k = 0; k < length; k++) {
      out[at(k)] = sum / (2 * r + 1)
      if (k + r + 1 < length) sum += src[at(k + r + 1)]
      if (k - r >= 0) sum -= src[at(k - r)]
    }
  }
  return out
}

/** Index of the closest art pixel within `r` of (x, y), or -1 if there is none. */
function nearestArtPixel(
  art: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
  r: number,
): number {
  let best = -1
  let bestDist = Infinity
  for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
    for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
      const d = (xx - x) ** 2 + (yy - y) ** 2
      if (art[yy * w + xx] && d < bestDist) {
        bestDist = d
        best = yy * w + xx
      }
    }
  }
  return best
}
