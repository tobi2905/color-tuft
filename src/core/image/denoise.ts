import { srgbToOklab } from '../color/convert'
import type { ImageGrid } from '../types'

/**
 * Edge-preserving denoise (a bilateral filter). Each pixel becomes a weighted average of its
 * neighbours within radiusPx. A neighbour counts more the closer it is AND the more similar
 * its colour is (deltaE in OKLab, scale set by rangeDeltaE). Speckle gets averaged away;
 * pixels across a border are too different to count, so edges stay sharp.
 *
 * Alpha is untouched. Pixels count in proportion to their alpha, so the hidden colour of
 * transparent pixels never leaks in.
 */
export function denoise(
  img: ImageGrid,
  opts: { radiusPx: number; rangeDeltaE: number },
): ImageGrid {
  if (!(opts.radiusPx >= 0 && opts.rangeDeltaE > 0)) {
    throw new Error(`Invalid denoise settings: radius ${opts.radiusPx}, range ${opts.rangeDeltaE}.`)
  }
  const { width: w, height: h, data: src } = img
  const r = Math.round(opts.radiusPx)
  const n = w * h

  // OKLab of every pixel, computed once. Used only for the "how similar?" weight.
  const lab = new Float32Array(n * 3)
  for (let p = 0; p < n; p++) {
    const c = srgbToOklab({ r: src[p * 4], g: src[p * 4 + 1], b: src[p * 4 + 2] })
    lab[p * 3] = c.L
    lab[p * 3 + 1] = c.a
    lab[p * 3 + 2] = c.b
  }

  // Distance weight: a Gaussian with sigma = radius / 2, precomputed for the whole window.
  const sigmaSpace = Math.max(r, 1) / 2
  const spaceWeight: number[] = []
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      spaceWeight.push(Math.exp(-(dx * dx + dy * dy) / (2 * sigmaSpace * sigmaSpace)))
    }
  }
  // Similarity weight: exp(-deltaE² / (2·sigma²)) with sigma = rangeDeltaE.
  // Beyond 3·sigma the weight is under 1.2% and is treated as 0. In between, a lookup
  // table replaces Math.exp, which would otherwise dominate the running time.
  const sigma2 = opts.rangeDeltaE * opts.rangeDeltaE
  const cutoff2 = 9 * sigma2 // (3·sigma)², in deltaE²
  const TABLE_SIZE = 1024
  const rangeWeight = new Float64Array(TABLE_SIZE + 1)
  for (let i = 0; i <= TABLE_SIZE; i++) {
    rangeWeight[i] = Math.exp(-((i / TABLE_SIZE) * cutoff2) / (2 * sigma2))
  }
  // OKLab distance² × 10,000 = deltaE²; × TABLE_SIZE / cutoff2 = table position.
  const toIndex = (10_000 * TABLE_SIZE) / cutoff2

  const out = new Uint8ClampedArray(src)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (src[p * 4 + 3] === 0) continue // fully transparent: nothing to clean

      let sumR = 0
      let sumG = 0
      let sumB = 0
      let sumW = 0
      let k = 0
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy
        for (let dx = -r; dx <= r; dx++, k++) {
          const xx = x + dx
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const q = yy * w + xx
          const dL = lab[p * 3] - lab[q * 3]
          const da = lab[p * 3 + 1] - lab[q * 3 + 1]
          const db = lab[p * 3 + 2] - lab[q * 3 + 2]
          const index = Math.round((dL * dL + da * da + db * db) * toIndex)
          if (index > TABLE_SIZE) continue // too different to count: across an edge
          const weight = spaceWeight[k] * rangeWeight[index] * src[q * 4 + 3]
          sumR += src[q * 4] * weight
          sumG += src[q * 4 + 1] * weight
          sumB += src[q * 4 + 2] * weight
          sumW += weight
        }
      }
      // sumW > 0: the pixel itself always counts (distance 0, similarity 1, alpha > 0).
      out[p * 4] = sumR / sumW
      out[p * 4 + 1] = sumG / sumW
      out[p * 4 + 2] = sumB / sumW
    }
  }
  return { width: w, height: h, data: out }
}
