import { deltaE } from '../color/distance'
import type { OKLab } from '../types'

/**
 * One dominant colour of the art. `distinct` marks a colour that stands on its own: separated
 * from every larger peak by a valley in the histogram (see findPeaks), and at least
 * DISTINCT_DELTA_E from every larger peak.
 */
export type Peak = { lab: OKLab; share: number; distinct: boolean }

/** A peak this large counts as a real colour of the art, however small its area. */
export const MIN_PEAK_SHARE = 0.002
/** A distinct peak is at least this far (deltaE) from every larger peak. */
export const DISTINCT_DELTA_E = 10
/** A histogram cube holding at least this share of the samples is "well filled". */
export const ISLAND_MIN_SHARE = 0.001
/**
 * Two peaks are separate colours if, on the best path between them, the emptiest cube holds
 * less than this share of the lower peak's samples (a valley). A gradient has no such valley.
 */
export const VALLEY_RATIO = 0.3

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
 * Valleys: like a mountain's prominence, add cubes from fullest to emptiest; when a peak's
 * group first meets a group with a higher peak, the cube where they meet is the saddle. A
 * saddle of at least VALLEY_RATIO of the peak means no valley: the two belong together (a
 * gradient is filled evenly all along). A lower saddle is a valley: two tones with a soft
 * transition (cel shading), or a separate detail (an empty gap). Of each group of peaks
 * joined without valleys, only the largest (by share) is distinct.
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

  const saddle = saddleRatios(bins, neighbours, higher)

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

  // Peaks joined without a valley form one group (a gradient, or noise around one colour).
  const group = new Map<number, number>()
  const groupOf = (k: number): number => {
    let r = k
    while (group.has(r)) r = group.get(r)!
    return r
  }
  for (const [low, { ratio, high }] of saddle) {
    if (ratio >= VALLEY_RATIO && groupOf(low) !== groupOf(high))
      group.set(groupOf(low), groupOf(high))
  }
  // Distinct: the largest peak (by share) of its group, and far from every larger peak.
  const groupsSeen = new Set<number>()
  peaks.forEach((peak, i) => {
    const g = groupOf(peak.key)
    const firstOfGroup = !groupsSeen.has(g)
    groupsSeen.add(g)
    const farFromLarger = peaks
      .slice(0, i)
      .every((q) => deltaE(peak.lab, q.lab) >= DISTINCT_DELTA_E)
    peak.distinct = firstOfGroup && farFromLarger
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
 * The histogram's filled cubes as candidate colours: each cube's average colour and how many
 * samples it holds, in a fixed order. Used to pick extra palette colours: a cube's average is
 * a colour that really occurs in the art, never a single stray pixel.
 */
export function cubeMeans(samples: OKLab[], binSize = 0.02): { lab: OKLab; count: number }[] {
  const { cubeOf } = cubeGrid(binSize)
  const cubes = new Map<number, { L: number; a: number; b: number; count: number }>()
  for (const s of samples) {
    const key = cubeOf(s)
    let c = cubes.get(key)
    if (!c) cubes.set(key, (c = { L: 0, a: 0, b: 0, count: 0 }))
    c.L += s.L
    c.a += s.a
    c.b += s.b
    c.count++
  }
  return [...cubes.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([, c]) => ({
      lab: { L: c.L / c.count, a: c.a / c.count, b: c.b / c.count },
      count: c.count,
    }))
}

/**
 * For each cube that is the top of its group when that group first meets a group with a
 * higher top: saddle count ÷ its own count, and that higher top. Cubes are added fullest
 * first (union–find); a top that never meets a higher one gets no entry (fully separate).
 */
function saddleRatios(
  bins: Map<number, Bin>,
  neighbours: (key: number) => number[],
  higher: (k1: number, k2: number) => boolean,
): Map<number, { ratio: number; high: number }> {
  const order = [...bins.keys()].sort((a, b) => (higher(a, b) ? -1 : higher(b, a) ? 1 : 0))
  const parent = new Map<number, number>()
  const top = new Map<number, number>() // group root -> its highest cube
  const ratio = new Map<number, { ratio: number; high: number }>()

  const root = (k: number): number => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r)!
    while (parent.get(k) !== r) {
      const next = parent.get(k)!
      parent.set(k, r)
      k = next
    }
    return r
  }

  for (const key of order) {
    parent.set(key, key)
    top.set(key, key)
    for (const n of neighbours(key)) {
      if (!parent.has(n)) continue // not added yet: emptier than this cube
      const a = root(key)
      const b = root(n)
      if (a === b) continue
      const ta = top.get(a)!
      const tb = top.get(b)!
      const [high, low] = higher(ta, tb) ? [ta, tb] : [tb, ta]
      // The lower group's top meets a higher one here: this cube is its saddle.
      if (!ratio.has(low))
        ratio.set(low, { ratio: bins.get(key)!.count / bins.get(low)!.count, high })
      parent.set(b, a)
      top.set(a, high)
    }
  }
  return ratio
}
