/** Longest side we work with. At about 1 mm per pixel that is a 4 m rug, far beyond any real one. */
export const MAX_SIDE_PX = 4096

/** Shrinks a size so neither side exceeds maxSide, keeping the aspect ratio. Never enlarges. */
export function capSize(
  w: number,
  h: number,
  maxSide = MAX_SIDE_PX,
): { width: number; height: number; downscaled: boolean } {
  if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h))) {
    throw new Error(`Invalid image size ${w} × ${h}.`)
  }
  const scale = maxSide / Math.max(w, h)
  if (scale >= 1) return { width: w, height: h, downscaled: false }
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    downscaled: true,
  }
}
