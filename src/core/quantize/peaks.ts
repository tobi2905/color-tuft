import { deltaE } from '../color/distance'
import type { OKLab } from '../types'

/**
 * One dominant colour of the art. `distinct` marks a colour that stands on its own: the
 * largest peak of its colour island, and at least DISTINCT_DELTA_E from every larger peak.
 */
export type Peak = { lab: OKLab; share: number; distinct: boolean }

/** A peak this large counts as a real colour of the art, however small its area. */
export const MIN_PEAK_SHARE = 0.002
/** A distinct peak is at least this far (deltaE) from every larger peak. */
export const DISTINCT_DELTA_E = 10
/** Only cubes holding at least this share of the samples join colour islands. */
export const ISLAND_MIN_SHARE = 0.001

type Bin = { count: number; sumL: number; sumA: number; sumB: number; peak: number }

/**
 * The dominant colours of flat art. Samples go into cubes of binSize in OKLab (a 3D
 * histogram). A cube holding more samples than all 26 neighbours is a peak: one colour of
 * the art. Every other cube climbs to its fullest neighbour until it reaches a peak, so each
 * sample belongs to exactly one peak and the shares add up to 1.
 *
 * A peak's colour is the mean of the samples in its own cube (not the whole basin), so long
 * soft tails, e.g. anti-aliased edges, don't pull it off the true colour.
 *
 * Colour islands: well-filled cubes that touch form one island. A gradient is one island
 * (its colours form an unbroken chain), a separate flat colour is an island of its own.
 * Thinly filled cubes, like the few blended pixels along an anti-aliased edge, don't join,
 * so they can't bridge two real colours into one island.
 *
 * Sorted by share, largest first.
 */
export function findPeaks(samples: OKLab[], binSize = 0.02): Peak[] {
  if (samples.length === 0) return []

  const { SIDE, keyOf, cubeOf } = cubeGrid(binSize)

  const bins = new Map<number, Bin>()
  for (const s of samples) {
    const key = cubeOf(s)
    let bin = bins.get(key)
    if (!bin) bins.set(key, (bin = { count: 0, sumL: 0, sumA: 0, sumB: 0, peak: -1 }))
    bin.count++
    bin.sumL += s.L
    bin.sumA += s.a
    bin.sumB += s.b
  }

  /** Keys of the filled cubes around `key` (up to 26). */
  function neighbours(key: number): number[] {
    const b = key % SIDE
    const a = Math.floor(key / SIDE) % SIDE
    const l = Math.floor(key / (SIDE * SIDE))
    const found: number[] = []
    for (let dl = -1; dl <= 1; dl++) {
      for (let da = -1; da <= 1; da++) {
        for (let db = -1; db <= 1; db++) {
          const nl = l + dl
          const na = a + da
          const nb = b + db
          if (nl < 0 || na < 0 || nb < 0 || nl >= SIDE || na >= SIDE || nb >= SIDE) continue
          const nKey = keyOf(nl, na, nb)
          if (nKey !== key && bins.has(nKey)) found.push(nKey)
        }
      }
    }
    return found
  }

  // "Higher" with a tie-break on the key, so two equal neighbouring cubes never both count
  // as a peak.
  const higher = (k1: number, k2: number) => {
    const c1 = bins.get(k1)!.count
    const c2 = bins.get(k2)!.count
    return c1 > c2 || (c1 === c2 && k1 < k2)
  }

  /** The fullest neighbour if it is higher than this cube, else -1 (this cube is a peak). */
  function uphill(key: number): number {
    let best = key
    for (const n of neighbours(key)) if (higher(n, best)) best = n
    return best === key ? -1 : best
  }

  /** The peak this cube's uphill path ends at, remembered along the way. */
  function peakOf(key: number): number {
    const path: number[] = []
    let k = key
    while (bins.get(k)!.peak === -1) {
      const next = uphill(k)
      if (next === -1) {
        bins.get(k)!.peak = k
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

  const island = colourIslands(bins, neighbours, ISLAND_MIN_SHARE * samples.length)

  const peaks = [...basinCount].map(([key, count]) => {
    const bin = bins.get(key)!
    return {
      key,
      lab: { L: bin.sumL / bin.count, a: bin.sumA / bin.count, b: bin.sumB / bin.count },
      share: count / samples.length,
      distinct: false,
    }
  })
  peaks.sort((p, q) => q.share - p.share || p.key - q.key)

  // Distinct: the first (largest) peak of its island, and far from every larger peak.
  // A peak whose own cube is too thin to join an island counts as an island of its own.
  const islandsSeen = new Set<number>()
  peaks.forEach((peak, i) => {
    const id = island.get(peak.key) ?? peak.key
    const topOfIsland = !islandsSeen.has(id)
    islandsSeen.add(id)
    const farFromLarger = peaks
      .slice(0, i)
      .every((q) => deltaE(peak.lab, q.lab) >= DISTINCT_DELTA_E)
    peak.distinct = topOfIsland && farFromLarger
  })

  return peaks.map(({ lab, share, distinct }) => ({ lab, share, distinct }))
}

/**
 * The histogram grid: cubes of binSize in OKLab. L covers [0, 1], a and b about
 * [-0.5, 0.5]; SIDE cubes per axis. `cubeOf` gives a colour's cube as one number.
 */
function cubeGrid(binSize: number) {
  const SIDE = Math.ceil(1 / binSize) + 2
  const cell = (v: number, offset: number) =>
    Math.min(SIDE - 1, Math.max(0, Math.floor((v + offset) / binSize)))
  const keyOf = (l: number, a: number, b: number) => (l * SIDE + a) * SIDE + b
  const cubeOf = (c: OKLab) => keyOf(cell(c.L, 0), cell(c.a, 0.5), cell(c.b, 0.5))
  return { SIDE, keyOf, cubeOf }
}

/**
 * Groups touching cubes with at least minCount samples into islands (union–find).
 * Returns each such cube's island id; thinner cubes are left out.
 */
function colourIslands(
  bins: Map<number, Bin>,
  neighbours: (key: number) => number[],
  minCount: number,
): Map<number, number> {
  const parent = new Map<number, number>()
  for (const [key, bin] of bins) if (bin.count >= minCount) parent.set(key, key)

  const root = (k: number): number => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r)!
    // Point everything on the way straight at the root, so later lookups are quick.
    while (parent.get(k) !== r) {
      const next = parent.get(k)!
      parent.set(k, r)
      k = next
    }
    return r
  }

  for (const key of parent.keys()) {
    for (const n of neighbours(key)) {
      if (!parent.has(n)) continue
      const a = root(key)
      const b = root(n)
      if (a !== b) parent.set(Math.max(a, b), Math.min(a, b))
    }
  }

  const island = new Map<number, number>()
  for (const key of parent.keys()) island.set(key, root(key))
  return island
}
