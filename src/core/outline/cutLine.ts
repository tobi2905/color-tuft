import { distanceTransform } from '../cleanup/distance'
import { buildPattern, ringToPath } from '../trace/pattern'
import { NO_LABEL, type PathSeg, type Pt } from '../types'

/** One closed cut line (mm). The rug is on its left: outer loops and holes go opposite ways. */
export type CutLoop = { start: Pt; segs: PathSeg[] }

/**
 * Where to cut a shaped rug, around the art (`art`: 1 = art, w × h pixels of mmPerPx mm):
 * 1. Grow by offsetMm: every pixel within offsetMm of the art joins the rug, a border to glue
 *    and finish without cutting into the design. Outward corners come out rounded.
 * 2. Close by smoothMm: grow by smoothMm, then shrink back by the same amount. Gaps narrower
 *    than 2 × smoothMm fill up and inward corners are rounded with radius smoothMm, so
 *    nothing is too tight to cut.
 * 3. Trace and fit (5.1–5.3): smooth lines, one loop per piece of rug and per hole in it.
 * The grid is padded internally, so growth beyond the original grid is never cut off; points
 * are in mm in the original grid's frame (they may be negative or beyond its size).
 */
export function cutLine(
  art: Uint8Array,
  w: number,
  h: number,
  mmPerPx: number,
  opts: { offsetMm: number; smoothMm: number },
): CutLoop[] {
  return cutRug(art, w, h, mmPerPx, opts).loops
}

/**
 * cutLine's loops, plus the rug itself as a mask on the same w × h grid (1 = inside the cut):
 * art plus the border band. Parts of the rug beyond the grid are not in the mask, so give the
 * grid room for the border.
 */
export function cutRug(
  art: Uint8Array,
  w: number,
  h: number,
  mmPerPx: number,
  opts: { offsetMm: number; smoothMm: number },
): { loops: CutLoop[]; mask: Uint8Array } {
  const offsetPx = Math.max(0, opts.offsetMm / mmPerPx)
  const smoothPx = Math.max(0, opts.smoothMm / mmPerPx)
  const pad = Math.ceil(offsetPx + smoothPx) + 2
  const W = w + 2 * pad
  const H = h + 2 * pad

  let rug: Uint8Array = new Uint8Array(W * H)
  let any = false
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (art[y * w + x]) {
        rug[(y + pad) * W + x + pad] = 1
        any = true
      }
    }
  }
  if (!any) return { loops: [], mask: new Uint8Array(w * h) }

  // 1. Grow by the offset.
  if (offsetPx > 0) rug = within(rug, W, H, offsetPx)
  // 2. Close: grow by the smoothing radius, then keep only pixels further than that from the
  //    outside again.
  if (smoothPx > 0) {
    const grown = within(rug, W, H, smoothPx)
    const toOutside = distanceTransform(grown, W, H)
    rug = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) rug[i] = toOutside[i] > smoothPx ? 1 : 0
  }

  // 3. Trace and fit, then move back into the original frame.
  const labels = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) labels[i] = rug[i] ? 0 : NO_LABEL
  const map = { width: W, height: H, mmPerPx, labels }
  const pattern = buildPattern(map, { widthMm: W * mmPerPx, heightMm: H * mmPerPx })
  const shift = pad * mmPerPx
  const move = (p: Pt): Pt => ({ x: p.x - shift, y: p.y - shift })
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) mask[y * w + x] = rug[(y + pad) * W + x + pad]
  }
  const loops = pattern.regions.flatMap((region) =>
    region.rings.map((ring) => {
      const { start, segs } = ringToPath(pattern, ring)
      return {
        start: move(start),
        segs: segs.map((s) =>
          s.kind === 'line'
            ? { kind: 'line' as const, to: move(s.to) }
            : { kind: 'cubic' as const, c1: move(s.c1), c2: move(s.c2), to: move(s.to) },
        ),
      }
    }),
  )
  return { loops, mask }
}

/**
 * The pixels within `radius` of a set pixel (a grow by radius, using the distance transform).
 * Plain loops: Uint8Array.from with a callback is ~50× slower on a whole rug.
 */
function within(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const n = w * h
  const notSet = new Uint8Array(n)
  for (let i = 0; i < n; i++) notSet[i] = mask[i] ? 0 : 1
  const distance = distanceTransform(notSet, w, h)
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = distance[i] <= radius ? 1 : 0
  return out
}
