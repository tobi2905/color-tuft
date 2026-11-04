import { srgbToOklab } from '../color/convert'
import { deltaE } from '../color/distance'
import { mixDistance } from '../color/mix'
import { seededRandom } from '../random'
import type { ImageGrid, OKLab } from '../types'

/** Opposite neighbours this far apart (deltaE) mean the pixel may sit on an edge. */
const EDGE_CONTRAST = 10
/** A pixel this close (deltaE) to a mix of its two opposite neighbours is a blend of them. */
const EDGE_MIX = 3
/** Distances (px) at which opposite neighbours are compared; covers blends up to ~6 px wide. */
const EDGE_REACH = [1, 2, 3]
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]

/**
 * Up to maxSamples pixel colours in OKLab, picked at random without repeats (seeded, so the
 * same seed gives the same samples). Finding colours on a sample is fast and, for flat art,
 * just as accurate as using every pixel.
 *
 * Skipped:
 * - pixels under 50 % alpha (outside the art);
 * - edge blends: pixels whose colour is a mix of two clearly different colours on opposite
 *   sides of them, as along every anti-aliased or resized edge. Those in-between colours
 *   are not colours of the art. A thin line is kept: the pixels on both sides of it are the
 *   same colour. A gradient is kept: its neighbours differ only a little.
 */
export function samplePixels(img: ImageGrid, maxSamples: number, seed: number): OKLab[] {
  const { width: w, height: h, data } = img
  const opaque: number[] = []
  for (let p = 0; p < w * h; p++) if (data[p * 4 + 3] >= 128) opaque.push(p)

  const labCache = new Map<number, OKLab>()
  const labAt = (p: number) => {
    let c = labCache.get(p)
    if (!c) {
      c = srgbToOklab({ r: data[p * 4], g: data[p * 4 + 1], b: data[p * 4 + 2] })
      labCache.set(p, c)
    }
    return c
  }

  function isEdgeBlend(p: number): boolean {
    const x = p % w
    const y = (p - x) / w
    const c = labAt(p)
    for (const [dx, dy] of DIRECTIONS) {
      for (const r of EDGE_REACH) {
        const x1 = x - r * dx
        const y1 = y - r * dy
        const x2 = x + r * dx
        const y2 = y + r * dy
        if (x1 < 0 || y1 < 0 || x2 < 0 || y2 < 0 || x1 >= w || x2 >= w || y1 >= h || y2 >= h) {
          continue
        }
        const q1 = y1 * w + x1
        const q2 = y2 * w + x2
        if (data[q1 * 4 + 3] < 128 || data[q2 * 4 + 3] < 128) continue
        const a = labAt(q1)
        const b = labAt(q2)
        if (deltaE(a, b) < EDGE_CONTRAST) continue
        // In between two clearly different colours, and a mix of them, but neither of them.
        if (
          deltaE(c, a) >= EDGE_MIX &&
          deltaE(c, b) >= EDGE_MIX &&
          mixDistance(c, a, b) < EDGE_MIX
        ) {
          return true
        }
      }
    }
    return false
  }

  // Visit the opaque pixels in a seeded random order (Fisher–Yates, one step at a time) and
  // keep those that aren't edge blends until enough are collected.
  const random = seededRandom(seed)
  const samples: OKLab[] = []
  for (let i = 0; i < opaque.length && samples.length < maxSamples; i++) {
    const j = i + Math.floor(random() * (opaque.length - i))
    ;[opaque[i], opaque[j]] = [opaque[j], opaque[i]]
    if (!isEdgeBlend(opaque[i])) samples.push(labAt(opaque[i]))
  }
  return samples
}
