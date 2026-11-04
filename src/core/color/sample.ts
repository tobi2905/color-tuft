import type { ImageGrid, OKLab } from '../types'
import { srgbToOklab } from './convert'

/**
 * The colour at a spot: the per-channel median (in OKLab) of the pixels within radiusPx.
 * A median ignores the few odd pixels a mean would be pulled by: highlights on a cone of
 * yarn, JPEG noise, a stray anti-aliased edge. Transparent pixels (alpha < 128) are skipped.
 */
export function sampleColour(
  img: ImageGrid,
  at: { x: number; y: number },
  radiusPx: number,
): OKLab {
  const L: number[] = []
  const a: number[] = []
  const b: number[] = []
  const r = Math.max(0, radiusPx)
  const cx = Math.floor(at.x)
  const cy = Math.floor(at.y)
  for (
    let y = Math.max(0, cy - Math.ceil(r));
    y <= Math.min(img.height - 1, cy + Math.ceil(r));
    y++
  ) {
    for (
      let x = Math.max(0, cx - Math.ceil(r));
      x <= Math.min(img.width - 1, cx + Math.ceil(r));
      x++
    ) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue
      const i = (y * img.width + x) * 4
      if (img.data[i + 3] < 128) continue
      const c = srgbToOklab({ r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] })
      L.push(c.L)
      a.push(c.a)
      b.push(c.b)
    }
  }
  if (L.length === 0) throw new Error('No visible pixels at this spot.')
  return { L: median(L), a: median(a), b: median(b) }
}

function median(values: number[]): number {
  const v = [...values].sort((x, y) => x - y)
  const mid = v.length >> 1
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}
