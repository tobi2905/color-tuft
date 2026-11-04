import type { ImageGrid, RugSize } from '../types'

/**
 * Places the art on a canvas the size of the real rug: (rug size / mmPerPx) pixels.
 * The art keeps its aspect ratio, fits inside, and is centred; the rest is transparent.
 * From here on every pixel is mmPerPx millimetres wide.
 *
 * Shrinking averages the source pixels each output pixel covers; enlarging blends the
 * nearest two in each direction (bilinear). Colour is weighted by alpha while averaging,
 * so the hidden colour of transparent pixels never bleeds into the edge.
 */
export function fitToRug(img: ImageGrid, rug: RugSize, mmPerPx: number): ImageGrid {
  for (const v of [rug.widthMm, rug.heightMm, mmPerPx]) {
    if (!(v > 0 && Number.isFinite(v))) {
      throw new Error(
        `Invalid rug size or scale: ${rug.widthMm} × ${rug.heightMm} mm at ${mmPerPx} mm/px.`,
      )
    }
  }

  const outW = Math.max(1, Math.round(rug.widthMm / mmPerPx))
  const outH = Math.max(1, Math.round(rug.heightMm / mmPerPx))
  const scale = Math.min(outW / img.width, outH / img.height)
  const artW = Math.max(1, Math.round(img.width * scale))
  const artH = Math.max(1, Math.round(img.height * scale))
  const left = Math.floor((outW - artW) / 2)
  const top = Math.floor((outH - artH) / 2)

  const out = new Uint8ClampedArray(outW * outH * 4) // all zeros: transparent

  if (artW === img.width && artH === img.height) {
    // Same size: copy row by row, no resampling.
    for (let y = 0; y < artH; y++) {
      const from = y * img.width * 4
      out.set(img.data.subarray(from, from + artW * 4), ((top + y) * outW + left) * 4)
    }
    return { width: outW, height: outH, data: out }
  }

  const xTaps = axisTaps(img.width, artW)
  const yTaps = axisTaps(img.height, artH)
  const src = img.data

  for (let y = 0; y < artH; y++) {
    for (let x = 0; x < artW; x++) {
      // Sum of alpha-weighted ("premultiplied") colour and of alpha over the covered pixels.
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (const ty of yTaps[y]) {
        for (const tx of xTaps[x]) {
          const i = (ty.index * img.width + tx.index) * 4
          const weight = tx.weight * ty.weight
          const wa = weight * src[i + 3]
          r += src[i] * wa
          g += src[i + 1] * wa
          b += src[i + 2] * wa
          a += wa
        }
      }
      if (a === 0) continue // fully transparent: leave as zeros
      const o = ((top + y) * outW + left + x) * 4
      out[o] = r / a
      out[o + 1] = g / a
      out[o + 2] = b / a
      out[o + 3] = a
    }
  }
  return { width: outW, height: outH, data: out }
}

type Tap = { index: number; weight: number }

/**
 * For each output position along one axis: which source positions it reads, with weights
 * that add up to 1.
 */
function axisTaps(srcLen: number, dstLen: number): Tap[][] {
  const taps: Tap[][] = []
  if (dstLen < srcLen) {
    // Shrinking: output pixel i covers the source span [i·ratio, (i+1)·ratio).
    // Each source pixel counts by how much of it lies inside that span.
    const ratio = srcLen / dstLen
    for (let i = 0; i < dstLen; i++) {
      const start = i * ratio
      const end = start + ratio
      const list: Tap[] = []
      for (let j = Math.floor(start); j < Math.min(srcLen, Math.ceil(end)); j++) {
        const overlap = Math.min(end, j + 1) - Math.max(start, j)
        if (overlap > 0) list.push({ index: j, weight: overlap / ratio })
      }
      taps.push(list)
    }
  } else {
    // Enlarging: find where the output pixel's centre lands in the source and blend the
    // two source pixels on either side (bilinear). At the borders both are the edge pixel.
    const scale = dstLen / srcLen
    for (let i = 0; i < dstLen; i++) {
      const s = (i + 0.5) / scale - 0.5
      const j = Math.floor(s)
      const t = s - j
      const clamp = (k: number) => Math.min(srcLen - 1, Math.max(0, k))
      taps.push([
        { index: clamp(j), weight: 1 - t },
        { index: clamp(j + 1), weight: t },
      ])
    }
  }
  return taps
}
