import { deltaE } from '../color/distance'
import { seededRandom } from '../random'
import type { OKLab } from '../types'
import { DISTINCT_DELTA_E, findPeaks } from './peaks'

/** A peak this large counts as a real colour of the art, however small its area. */
export const MIN_PEAK_SHARE = 0.002
/** Splitting stops when no sample is at least this far (deltaE) from every chosen colour. */
export const MIN_SPLIT_DELTA_E = 5

const MAX_ITERATIONS = 30

/**
 * The art's palette: at most `count` colours (more only if more are locked), lightest first.
 *
 * 1. Locked colours, then every distinct peak (see findPeaks) with share ≥ 0.2 % that is
 *    deltaE ≥ 10 from every chosen colour, largest first. A small eye is distinct, so it is
 *    kept before a gradient next to it gets split into bands.
 * 2. If more colours are wanted, split: add a sample far from all chosen colours (k-means++
 *    style, seeded), until count is reached or nothing is at least deltaE 5 away. Art with
 *    fewer colours than asked returns fewer, never near-duplicates.
 * 3. Refine with k-means. Locked colours never move; colours left with no samples are dropped.
 *
 * Blended edge pixels (anti-aliasing, resizing) are not colours of the art; samplePixels
 * already leaves them out.
 */
export function findPalette(
  samples: OKLab[],
  opts: { count: number; locked: OKLab[]; seed: number },
): OKLab[] {
  const target = Math.max(opts.count, opts.locked.length)
  const centres: OKLab[] = [...opts.locked]
  const isLocked = centres.map(() => true)
  if (samples.length === 0) return sortByLightness(centres)

  const farFromAll = (c: OKLab, minDelta: number) => centres.every((x) => deltaE(c, x) >= minDelta)

  // 1. Distinct peaks, largest first.
  const peaks = findPeaks(samples)
  for (const peak of peaks) {
    if (centres.length >= target) break
    if (peak.distinct && peak.share >= MIN_PEAK_SHARE && farFromAll(peak.lab, DISTINCT_DELTA_E)) {
      centres.push(peak.lab)
      isLocked.push(false)
    }
  }
  // Very scattered colours can leave every peak below MIN_PEAK_SHARE. Splitting needs at
  // least one colour to measure distances from, so start with the largest peak.
  if (centres.length === 0) {
    centres.push(peaks[0].lab)
    isLocked.push(false)
  }

  // 2. Split large areas: pick a far-away sample, more likely the farther it is.
  const random = seededRandom(opts.seed)
  const nearest = samples.map((s) => minDistance(s, centres))
  const canStart = (i: number) => nearest[i] >= MIN_SPLIT_DELTA_E

  while (centres.length < target) {
    let total = 0
    for (let i = 0; i < samples.length; i++) if (canStart(i)) total += nearest[i] ** 2
    if (total === 0) break // every sample is already close to a chosen colour

    let pick = random() * total
    let chosen = -1
    for (let i = 0; i < samples.length && pick > 0; i++) {
      if (!canStart(i)) continue
      pick -= nearest[i] ** 2
      chosen = i
    }
    const candidate = samples[chosen]
    centres.push(candidate)
    isLocked.push(false)
    for (let i = 0; i < samples.length; i++) {
      nearest[i] = Math.min(nearest[i], deltaE(samples[i], candidate))
    }
  }

  // 3. k-means.
  const assignment = new Int32Array(samples.length).fill(-1)
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let changed = false
    for (let i = 0; i < samples.length; i++) {
      const c = nearestIndex(samples[i], centres)
      if (c !== assignment[i]) {
        assignment[i] = c
        changed = true
      }
    }
    if (!changed) break

    const sums = centres.map(() => ({ L: 0, a: 0, b: 0, n: 0 }))
    for (let i = 0; i < samples.length; i++) {
      const s = sums[assignment[i]]
      s.L += samples[i].L
      s.a += samples[i].a
      s.b += samples[i].b
      s.n++
    }
    sums.forEach((s, c) => {
      if (!isLocked[c] && s.n > 0) centres[c] = { L: s.L / s.n, a: s.a / s.n, b: s.b / s.n }
    })
  }

  const used = new Set(assignment)
  return sortByLightness(centres.filter((_, c) => isLocked[c] || used.has(c)))
}

function minDistance(c: OKLab, centres: OKLab[]): number {
  let best = Infinity
  for (const x of centres) best = Math.min(best, deltaE(c, x))
  return best
}

function nearestIndex(c: OKLab, centres: OKLab[]): number {
  let best = 0
  let bestD = Infinity
  centres.forEach((x, i) => {
    const d = deltaE(c, x)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** Lightest first; equal lightness ordered by a, then b, so the order is always the same. */
function sortByLightness(colours: OKLab[]): OKLab[] {
  return [...colours].sort((p, q) => q.L - p.L || q.a - p.a || q.b - p.b)
}
