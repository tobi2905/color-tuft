import { srgbToOklab } from '../color/convert'
import { seededRandom } from '../random'
import type { ImageGrid, OKLab } from '../types'

/**
 * Up to maxSamples pixel colours in OKLab, picked at random without repeats (seeded, so the
 * same seed gives the same samples). Pixels under 50% alpha are outside the art and skipped.
 * Finding colours on a sample is fast and, for flat art, just as accurate as using every pixel.
 */
export function samplePixels(img: ImageGrid, maxSamples: number, seed: number): OKLab[] {
  const { data } = img
  const opaque: number[] = []
  for (let p = 0; p < img.width * img.height; p++) if (data[p * 4 + 3] >= 128) opaque.push(p)

  const count = Math.min(maxSamples, opaque.length)
  if (count < opaque.length) {
    // Partial Fisher–Yates shuffle: after step i, opaque[0..i] is a random pick without repeats.
    const random = seededRandom(seed)
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(random() * (opaque.length - i))
      ;[opaque[i], opaque[j]] = [opaque[j], opaque[i]]
    }
  }

  const samples: OKLab[] = []
  for (let i = 0; i < count; i++) {
    const p = opaque[i]
    samples.push(srgbToOklab({ r: data[p * 4], g: data[p * 4 + 1], b: data[p * 4 + 2] }))
  }
  return samples
}
