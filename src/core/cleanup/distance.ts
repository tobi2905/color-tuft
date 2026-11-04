/**
 * Exact Euclidean distance transform: for every pixel with mask = 1, the straight-line
 * distance (in pixels, centre to centre) to the nearest pixel with mask = 0; 0 where mask
 * is 0. Infinity if there is no mask-0 pixel at all. Beyond the image counts as neither.
 *
 * Felzenszwalb & Huttenlocher (2004): squared distances are found in two passes, first down
 * every column, then along every row. Each pass is a "lower envelope of parabolas" in one
 * dimension, linear in the number of pixels, so the whole transform is exact and fast.
 */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const squared = new Float64Array(w * h)
  for (let p = 0; p < w * h; p++) squared[p] = mask[p] ? Infinity : 0

  const n = Math.max(w, h)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)

  // Pass 1: down each column.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = squared[y * w + x]
    squaredDistance1D(f, h, d, v, z)
    for (let y = 0; y < h; y++) squared[y * w + x] = d[y]
  }
  // Pass 2: along each row, on top of the column results.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = squared[y * w + x]
    squaredDistance1D(f, w, d, v, z)
    for (let x = 0; x < w; x++) squared[y * w + x] = d[x]
  }

  const out = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) out[p] = Math.sqrt(squared[p])
  return out
}

/**
 * One dimension: d[q] = min over p of ((q − p)² + f[p]). Each p contributes a parabola with
 * its lowest point f[p] at p; the answer is the lower envelope of all parabolas. v holds the
 * positions of the parabolas in the envelope, z the points where one takes over from the next.
 */
function squaredDistance1D(
  f: Float64Array,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = -1 // index of the rightmost parabola in the envelope
  for (let q = 0; q < n; q++) {
    if (f[q] === Infinity) continue
    // Remove parabolas the new one hides completely.
    while (k >= 0) {
      const s = intersection(f, v[k], q)
      if (s > z[k]) break
      k--
    }
    k++
    v[k] = q
    z[k] = k === 0 ? -Infinity : intersection(f, v[k - 1], q)
    z[k + 1] = Infinity
  }

  if (k === -1) {
    // No finite value in this line: everything stays at Infinity.
    for (let q = 0; q < n; q++) d[q] = Infinity
    return
  }
  let j = 0
  for (let q = 0; q < n; q++) {
    while (z[j + 1] < q) j++
    d[q] = (q - v[j]) * (q - v[j]) + f[v[j]]
  }
}

/** Where the parabolas from p and q (p < q) cross. */
function intersection(f: Float64Array, p: number, q: number): number {
  return (f[q] + q * q - (f[p] + p * p)) / (2 * (q - p))
}
