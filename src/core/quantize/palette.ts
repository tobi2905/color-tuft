import { deltaE } from '../color/distance'
import type { OKLab } from '../types'
import { DISTINCT_DELTA_E, ISLAND_MIN_SHARE, MIN_PEAK_SHARE, cubeMeans, findPeaks } from './peaks'

/** An extra colour must be at least this far (deltaE) from every chosen colour. */
export const MIN_SPLIT_DELTA_E = 5

/**
 * The art's palette: at most `count` colours (more only if more are locked), lightest first.
 *
 * 1. Locked colours, then every distinct peak (see findPeaks) with share ≥ 0.2 % that is
 *    deltaE ≥ 10 from every chosen colour, largest first. A small eye is distinct, so it is
 *    kept before a gradient next to it gets split into bands.
 * 2. If more colours are wanted, add them one at a time with bestNextColour: each time the
 *    colour that brings the art closest to the palette. Stops early when nothing is at least
 *    deltaE 5 from every chosen colour, so art with fewer colours returns fewer.
 *
 * No refinement afterwards and no randomness: asking for one colour more gives exactly the
 * previous palette plus one colour; nothing else moves (the spec: never reshuffle).
 * Blended edge pixels (anti-aliasing, resizing) are not colours of the art; samplePixels
 * already leaves them out. `seed` is kept for compatibility; nothing is random any more.
 */
export function findPalette(
  samples: OKLab[],
  opts: { count: number; locked: OKLab[]; seed: number },
): OKLab[] {
  const target = Math.max(opts.count, opts.locked.length)
  const chosen: OKLab[] = [...opts.locked]
  if (samples.length === 0) return sortByLightness(chosen)

  // 1. Distinct peaks, largest first.
  const peaks = findPeaks(samples)
  for (const peak of peaks) {
    if (chosen.length >= target) break
    const farFromAll = chosen.every((c) => deltaE(c, peak.lab) >= DISTINCT_DELTA_E)
    if (peak.distinct && peak.share >= MIN_PEAK_SHARE && farFromAll) chosen.push(peak.lab)
  }
  // Very scattered colours can leave every peak below MIN_PEAK_SHARE: start with the largest.
  if (chosen.length === 0) chosen.push(peaks[0].lab)

  // 2. The next best colour, one at a time.
  const cubes = cubeMeans(samples)
  while (chosen.length < target) {
    const next = nextFromCubes(cubes, chosen, samples.length)
    if (!next) break
    chosen.push(next)
  }
  return sortByLightness(chosen)
}

/**
 * The colour that, added to `palette`, brings the samples closest to their nearest palette
 * colour: the biggest drop in the sum of squared deltaE. Candidates are the average colours
 * of the histogram's well-filled cubes, at least deltaE 5 from every palette colour. Null if
 * there is none.
 */
export function bestNextColour(samples: OKLab[], palette: OKLab[]): OKLab | null {
  return nextFromCubes(cubeMeans(samples), palette, samples.length)
}

function nextFromCubes(
  cubes: { lab: OKLab; count: number }[],
  palette: OKLab[],
  sampleCount: number,
): OKLab | null {
  // Each cube stands for its samples (its average colour, weighted by its count).
  const nearestSq = cubes.map((c) => Math.min(...palette.map((p) => deltaE(c.lab, p) ** 2)))

  // Candidates: cubes far enough from the palette, and well filled (not a stray pixel). Only
  // if no cube is well filled (very scattered colours) may any cube be a candidate.
  const far = cubes.filter((_, i) => nearestSq[i] >= MIN_SPLIT_DELTA_E ** 2)
  const minCount = Math.max(2, ISLAND_MIN_SHARE * sampleCount)
  const filled = far.filter((c) => c.count >= minCount)
  const candidates = filled.length > 0 ? filled : far

  let best: OKLab | null = null
  let bestGain = 0
  for (const candidate of candidates) {
    let gain = 0
    cubes.forEach((c, i) => {
      const d = deltaE(c.lab, candidate.lab) ** 2
      if (d < nearestSq[i]) gain += c.count * (nearestSq[i] - d)
    })
    if (gain > bestGain) {
      bestGain = gain
      best = candidate.lab
    }
  }
  return best
}

/** Lightest first; equal lightness ordered by a, then b, so the order is always the same. */
function sortByLightness(colours: OKLab[]): OKLab[] {
  return [...colours].sort((p, q) => q.L - p.L || q.a - p.a || q.b - p.b)
}
