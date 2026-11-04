import { deltaE } from './color/distance'
import { mergeSmallIslands } from './cleanup/islands'
import { type OutlineWhere, addOutlines, suggestOutlines } from './cleanup/outlines'
import { type ThinPart, findThinParts, thickenLabel } from './cleanup/thin'
import { denoise } from './image/denoise'
import { fitToRug } from './image/fitToRug'
import { FINE_MM_PER_PX, assignLabels } from './quantize/assign'
import { type ColourMerge, applyMerges } from './quantize/merge'
import { findPalette } from './quantize/palette'
import { findPeaks } from './quantize/peaks'
import { samplePixels } from './quantize/sample'
import { suggestCount } from './quantize/suggest'
import { buildPattern } from './trace/pattern'
import { srgbToOklab } from './color/convert'
import { type BackgroundMethod, detectBackground } from './outline/background'
import { type BackgroundEdit, applyBackgroundEdits } from './outline/backgroundEdits'
import { type CutLoop, cutRug } from './outline/cutLine'
import {
  type ImageGrid,
  type LabelMap,
  NO_LABEL,
  type OKLab,
  type Pt,
  type RugSize,
  type VectorPattern,
} from './types'

/** Edge-preserving denoise settings (see denoise). */
export const DENOISE = { radiusPx: 2, rangeDeltaE: 10 }
/** Colours are found on this many random pixels. */
export const SAMPLE_COUNT = 20_000
/** An outline colour this close (deltaE) to a palette colour reuses that colour. */
const SAME_COLOUR_DELTA_E = 3

export type PipelineInput = {
  image: ImageGrid
  /** The artwork's size. A shaped rug's border grows beyond it (see `cut`). */
  rug: RugSize
  /** How many colours to find (locked colours included); null = the suggested count. */
  count: number | null
  /** Colours that must appear exactly, e.g. owned yarns. */
  locked: OKLab[]
  /** Smallest tuftable detail: areas under minDetail² are merged, thinner lines flagged. */
  minDetailMm: number
  /** Separation outlines, or null when turned off (the default). */
  outlines: { widthMm: number; colour: OKLab; where: OutlineWhere } | null
  /** Colours whose thin lines the user chose to thicken to minDetailMm ("Thicken"). By colour,
   *  not label: labels can change between runs. */
  thicken: OKLab[]
  /** Colours the user chose to merge into another ("Merge into…"). */
  merges: ColourMerge[]
  /** Shaped: cut along the art, background removed. Rectangle: empty space gets a yarn. */
  shape: 'shaped' | 'rectangle'
  /** Shaped rugs: the border beyond the art (mm) and the rounding of tight inner corners. */
  offsetMm: number
  smoothMm: number
  /** Shaped rugs: clicks that turn an area into background or back into art. */
  backgroundEdits: BackgroundEdit[]
  /** The border yarn of a shaped rug; null = the colour the art's outer edge mostly has. */
  borderColour: OKLab | null
  /** The yarn for the empty space of a rectangular rug; null = white. */
  backgroundColour: OKLab | null
  seed: number
}

export type PipelineResult = {
  /** Colours, lightest first; the index is the label in `map`. Extra colours (outline, border,
   *  background) may follow. */
  palette: OKLab[]
  /** "This art has N colours". */
  suggestedCount: number
  /** The cleaned colour map, 1 mm per pixel: the art area, plus the border for a shaped rug. */
  map: LabelMap
  pattern: VectorPattern
  /** Lines thinner than minDetailMm: warnings, never deleted. */
  thin: ThinPart[]
  /** A palette label that already works as outlines in the art, or null. */
  outlineSuggestion: number | null
  /** How many found colours were merged into others: found = palette.length + mergedAway. */
  mergedAway: number
  /** The cut line of a shaped rug (mm, in the map's frame); null for a rectangle. */
  cut: CutLoop[] | null
  /** Which palette labels are the border yarn and the background yarn, if any. */
  roles: { border: number | null; background: number | null }
  /** Whether that colour was added for the role (true) or an art colour reused for it. */
  rolesAdded: { border: boolean; background: boolean }
  /** How the background was found ('none' for rectangles: they keep everything). */
  background: BackgroundMethod
  /** Where the art area's top-left corner sits in the map (mm): the border's width. */
  artOriginMm: Pt
}

/** The image stages' results: they depend only on the image, the rug size, the shape, the
 *  background edits and the seed. */
export type PreparedImage = {
  /** The image at rug size (1 mm per pixel), denoised; background transparent for shaped rugs. */
  clean: ImageGrid
  samples: OKLab[]
  suggestedCount: number
  /** How big one pixel of the original image is on the rug (mm). */
  sourcePxMm: number
  background: BackgroundMethod
}

const WHITE = srgbToOklab({ r: 255, g: 255, b: 255 })

/**
 * The whole image pipeline, from an image to a vector pattern:
 * (shaped: remove the background) → fit to the rug → denoise → sample → peaks → suggested
 * count (prepareImage), then palette → colour map → merges → (rectangle: background yarn) →
 * outlines (only if turned on) → merge small islands → thicken chosen colours → (shaped:
 * cut line and border) → thin-line warnings → vector pattern (finishPipeline).
 */
export function runPipeline(input: PipelineInput): PipelineResult {
  return finishPipeline(prepareImage(input), input)
}

/** The stages that depend only on the image, the rug size, the shape and background edits. */
export function prepareImage(
  input: Pick<PipelineInput, 'image' | 'rug' | 'seed' | 'shape' | 'backgroundEdits'>,
): PreparedImage {
  let image = input.image
  let background: BackgroundMethod = 'none'
  if (input.shape === 'shaped') {
    // Detected on the original image: fitting adds transparent padding that would look like
    // transparency. The background becomes transparent, so it is outside the rug from here on.
    const found = detectBackground(image)
    background = found.method
    // Only "bring back" clicks act on the image (a detected backdrop gets its colours back).
    // Removing works on the pattern's areas, in finishPipeline.
    const restore = input.backgroundEdits.filter((e) => !e.background)
    const mask = applyBackgroundEdits(image, found.mask, restore, input.rug)
    const data = new Uint8ClampedArray(image.data)
    for (let p = 0; p < mask.length; p++) if (mask[p]) data[p * 4 + 3] = 0
    image = { ...image, data }
  }
  const clean = denoise(fitToRug(image, input.rug, FINE_MM_PER_PX), DENOISE)
  const samples = samplePixels(clean, SAMPLE_COUNT, input.seed)
  return {
    clean,
    samples,
    suggestedCount: suggestCount(findPeaks(samples)),
    // fitToRug scales by the smaller of the two ratios.
    sourcePxMm: Math.min(
      input.rug.widthMm / input.image.width,
      input.rug.heightMm / input.image.height,
    ),
    background,
  }
}

/** The stages that depend on the colour and outline settings: everything from the palette on. */
export function finishPipeline(prepared: PreparedImage, input: PipelineInput): PipelineResult {
  const { clean, samples, suggestedCount, sourcePxMm } = prepared
  const found = findPalette(samples, {
    count: input.count ?? suggestedCount,
    locked: input.locked,
    seed: input.seed,
  })

  const merged = applyMerges(assignLabels(clean, found, FINE_MM_PER_PX), found, input.merges)
  const mergedAway = found.length - merged.palette.length
  const palette = [...merged.palette] // a copy: extra colours may be added below
  let map = merged.map
  const outlineSuggestion = suggestOutlines(map, palette)
  /** The label of a colour: an existing one if practically the same, else a new entry. */
  const added = new Set<number>()
  const labelFor = (colour: OKLab) => {
    const existing = palette.findIndex((p) => deltaE(p, colour) < SAME_COLOUR_DELTA_E)
    if (existing !== -1) return existing
    palette.push(colour)
    added.add(palette.length - 1)
    return palette.length - 1
  }

  // Rectangle: empty space (transparency, padding) becomes the background yarn.
  let backgroundLabel: number | null = null
  if (input.shape === 'rectangle' && map.labels.includes(NO_LABEL)) {
    backgroundLabel = labelFor(input.backgroundColour ?? WHITE)
    const labels = Uint8Array.from(map.labels)
    for (let p = 0; p < labels.length; p++) if (labels[p] === NO_LABEL) labels[p] = backgroundLabel
    map = { ...map, labels }
  }

  if (input.outlines) {
    const { colour, widthMm, where } = input.outlines
    map = addOutlines(map, { widthMm, label: labelFor(colour), where })
  }

  map = mergeSmallIslands(map, input.minDetailMm * input.minDetailMm)
  for (const colour of input.thicken) {
    const label = palette.findIndex((p) => deltaE(p, colour) < SAME_COLOUR_DELTA_E)
    if (label !== -1) map = thickenLabel(map, label, input.minDetailMm)
  }

  // Shaped: room for the border, the cut line, and the band between art and cut filled.
  let cut: CutLoop[] | null = null
  let borderLabel: number | null = null
  let artOriginMm: Pt = { x: 0, y: 0 }
  if (input.shape === 'shaped') {
    // "Remove" clicks: the whole area of the pattern under the click becomes background.
    // The border yarn follows the art's outer edge as found, not as changed by removals.
    const edge = mostCommonEdgeLabel(map)
    const removals = input.backgroundEdits.filter((e) => e.background).map((e) => e.at)
    if (removals.length > 0) map = removeAreas(map, removals)

    const padPx = Math.ceil((input.offsetMm + input.smoothMm) / map.mmPerPx) + 2
    map = padMap(map, padPx)
    artOriginMm = { x: padPx * map.mmPerPx, y: padPx * map.mmPerPx }
    const art = new Uint8Array(map.labels.length)
    for (let p = 0; p < art.length; p++) art[p] = map.labels[p] === NO_LABEL ? 0 : 1
    const cutOpts = { offsetMm: input.offsetMm, smoothMm: input.smoothMm }
    let rug = cutRug(art, map.width, map.height, map.mmPerPx, cutOpts)
    // "Bring back" clicks on a hole the cut line goes around (a see-through hole in the art,
    // or a removed area): the hole stays part of the rug, filled with the border yarn below.
    let filled = false
    for (const e of input.backgroundEdits.filter((e) => !e.background)) {
      const hole = holeAt(rug.mask, map, { x: e.at.x + artOriginMm.x, y: e.at.y + artOriginMm.y })
      for (const p of hole) art[p] = 1
      filled ||= hole.length > 0
    }
    if (filled) rug = cutRug(art, map.width, map.height, map.mmPerPx, cutOpts)
    cut = rug.loops
    const band: number[] = []
    for (let p = 0; p < art.length; p++) {
      if ((rug.mask[p] || art[p]) && map.labels[p] === NO_LABEL) band.push(p)
    }
    if (band.length > 0) {
      const colour = input.borderColour ?? (edge === null ? null : palette[edge])
      if (colour) {
        borderLabel = labelFor(colour)
        const labels = Uint8Array.from(map.labels)
        for (const p of band) labels[p] = borderLabel
        map = { ...map, labels }
      }
    }
  }

  const thin = findThinParts(map, input.minDetailMm)
  const rugMm = { widthMm: map.width * map.mmPerPx, heightMm: map.height * map.mmPerPx }
  const pattern = buildPattern(map, rugMm, { sourcePxMm })

  return {
    palette,
    suggestedCount,
    map,
    pattern,
    thin,
    outlineSuggestion,
    mergedAway,
    cut,
    roles: { border: borderLabel, background: backgroundLabel },
    rolesAdded: {
      border: borderLabel !== null && added.has(borderLabel),
      background: backgroundLabel !== null && added.has(backgroundLabel),
    },
    background: prepared.background,
    artOriginMm,
  }
}

/** Each clicked area of the pattern (the connected patch of its colour) becomes outside. */
function removeAreas(map: LabelMap, points: Pt[]): LabelMap {
  const { width: w, height: h } = map
  const labels = Uint8Array.from(map.labels)
  for (const at of points) {
    const x = Math.floor(at.x / map.mmPerPx)
    const y = Math.floor(at.y / map.mmPerPx)
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const start = y * w + x
    const label = labels[start]
    if (label === NO_LABEL) continue
    for (const p of floodFill(w, h, start, (q) => labels[q] === label)) labels[p] = NO_LABEL
  }
  return { ...map, labels }
}

/** The hole in the rug (outside its cut line, not open to the edge) at a point (mm), or []. */
function holeAt(rugMask: Uint8Array, map: LabelMap, at: Pt): number[] {
  const { width: w, height: h } = map
  const x = Math.floor(at.x / map.mmPerPx)
  const y = Math.floor(at.y / map.mmPerPx)
  if (x < 0 || y < 0 || x >= w || y >= h || rugMask[y * w + x]) return []
  const patch = floodFill(w, h, y * w + x, (q) => !rugMask[q])
  const touchesEdge = patch.some((p) => {
    const px = p % w
    const py = (p - px) / w
    return px === 0 || py === 0 || px === w - 1 || py === h - 1
  })
  return touchesEdge ? [] : patch
}

/** The 4-connected patch of pixels that `joins`, starting at `start`. */
function floodFill(w: number, h: number, start: number, joins: (p: number) => boolean): number[] {
  const seen = new Uint8Array(w * h)
  const patch: number[] = []
  const stack = [start]
  seen[start] = 1
  while (stack.length > 0) {
    const p = stack.pop()!
    patch.push(p)
    const x = p % w
    const y = (p - x) / w
    for (const q of [
      x > 0 ? p - 1 : -1,
      x < w - 1 ? p + 1 : -1,
      y > 0 ? p - w : -1,
      y < h - 1 ? p + w : -1,
    ]) {
      if (q !== -1 && !seen[q] && joins(q)) {
        seen[q] = 1
        stack.push(q)
      }
    }
  }
  return patch
}

/** The map with `padPx` pixels of outside (NO_LABEL) added on every side. */
function padMap(map: LabelMap, padPx: number): LabelMap {
  const width = map.width + 2 * padPx
  const height = map.height + 2 * padPx
  const labels = new Uint8Array(width * height).fill(NO_LABEL)
  for (let y = 0; y < map.height; y++) {
    labels.set(map.labels.subarray(y * map.width, (y + 1) * map.width), (y + padPx) * width + padPx)
  }
  return { ...map, width, height, labels }
}

/** The colour most common along the art's outer edge (art pixels next to the outside). */
function mostCommonEdgeLabel(map: LabelMap): number | null {
  const { width: w, height: h, labels } = map
  const counts = new Map<number, number>()
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      const l = labels[p]
      if (l === NO_LABEL) continue
      if (
        labels[p - 1] === NO_LABEL ||
        labels[p + 1] === NO_LABEL ||
        labels[p - w] === NO_LABEL ||
        labels[p + w] === NO_LABEL
      ) {
        counts.set(l, (counts.get(l) ?? 0) + 1)
      }
    }
  }
  let best: number | null = null
  for (const [l, c] of counts) if (best === null || c > counts.get(best)!) best = l
  return best
}

/**
 * The pipeline with the image stages remembered: while `imageKey` stays the same (same image,
 * same rug size), colour changes such as merges, locks or the count skip straight to
 * finishPipeline. Used by the worker. `preparedCount`: how often the image was prepared.
 */
export function createCachedPipeline() {
  let cache: { key: string; prepared: PreparedImage } | null = null
  let preparedCount = 0
  return {
    run(input: PipelineInput, imageKey: string): PipelineResult {
      if (cache?.key !== imageKey) {
        cache = { key: imageKey, prepared: prepareImage(input) }
        preparedCount++
      }
      return finishPipeline(cache.prepared, input)
    },
    get preparedCount() {
      return preparedCount
    },
  }
}
