import type { OKLab } from '../types'

export type Peak = { lab: OKLab; share: number }

type Bin = { count: number; sumL: number; sumA: number; sumB: number; peak: number }

/**
 * The dominant colours of flat art. Samples go into cubes of binSize in OKLab (a 3D
 * histogram). A cube holding more samples than all 26 neighbours is a peak: one colour of
 * the art. Every other cube climbs to its fullest neighbour until it reaches a peak, so each
 * sample belongs to exactly one peak and the shares add up to 1.
 *
 * A peak's colour is the mean of the samples in its own cube (not the whole basin), so long
 * soft tails, e.g. anti-aliased edges, don't pull it off the true colour.
 * Sorted by share, largest first.
 */
export function findPeaks(samples: OKLab[], binSize = 0.02): Peak[] {
  if (samples.length === 0) return []

  // Cube coordinates: L in [0, 1], a and b in about [-0.5, 0.5]; SIDE cubes per axis.
  const SIDE = Math.ceil(1 / binSize) + 2
  const cell = (v: number, offset: number) =>
    Math.min(SIDE - 1, Math.max(0, Math.floor((v + offset) / binSize)))
  const keyOf = (l: number, a: number, b: number) => (l * SIDE + a) * SIDE + b

  const bins = new Map<number, Bin>()
  for (const s of samples) {
    const key = keyOf(cell(s.L, 0), cell(s.a, 0.5), cell(s.b, 0.5))
    let bin = bins.get(key)
    if (!bin) bins.set(key, (bin = { count: 0, sumL: 0, sumA: 0, sumB: 0, peak: -1 }))
    bin.count++
    bin.sumL += s.L
    bin.sumA += s.a
    bin.sumB += s.b
  }

  // "Higher" with a tie-break on the key, so two equal neighbouring cubes never both count
  // as a peak.
  const higher = (k1: number, b1: Bin, k2: number, b2: Bin) =>
    b1.count > b2.count || (b1.count === b2.count && k1 < k2)

  /** The fullest neighbour if it is higher than this cube, else -1 (this cube is a peak). */
  function uphill(key: number, bin: Bin): number {
    const b = key % SIDE
    const a = Math.floor(key / SIDE) % SIDE
    const l = Math.floor(key / (SIDE * SIDE))
    let bestKey = key
    let best = bin
    for (let dl = -1; dl <= 1; dl++) {
      for (let da = -1; da <= 1; da++) {
        for (let db = -1; db <= 1; db++) {
          const nl = l + dl
          const na = a + da
          const nb = b + db
          if (nl < 0 || na < 0 || nb < 0 || nl >= SIDE || na >= SIDE || nb >= SIDE) continue
          const nKey = keyOf(nl, na, nb)
          const n = bins.get(nKey)
          if (n && higher(nKey, n, bestKey, best)) {
            bestKey = nKey
            best = n
          }
        }
      }
    }
    return bestKey === key ? -1 : bestKey
  }

  /** The peak this cube's uphill path ends at, remembered along the way. */
  function peakOf(key: number): number {
    const path: number[] = []
    let k = key
    while (true) {
      const bin = bins.get(k)!
      if (bin.peak !== -1) break
      const next = uphill(k, bin)
      if (next === -1) {
        bin.peak = k
        break
      }
      path.push(k)
      k = next
    }
    const peak = bins.get(k)!.peak
    for (const p of path) bins.get(p)!.peak = peak
    return peak
  }

  const basinCount = new Map<number, number>()
  for (const [key, bin] of bins) {
    const peak = peakOf(key)
    basinCount.set(peak, (basinCount.get(peak) ?? 0) + bin.count)
  }

  const peaks = [...basinCount].map(([key, count]) => {
    const bin = bins.get(key)!
    return {
      key,
      lab: { L: bin.sumL / bin.count, a: bin.sumA / bin.count, b: bin.sumB / bin.count },
      share: count / samples.length,
    }
  })
  peaks.sort((p, q) => q.share - p.share || p.key - q.key)
  return peaks.map(({ lab, share }) => ({ lab, share }))
}
