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
import type { ImageGrid, LabelMap, OKLab, RugSize, VectorPattern } from './types'

/** Edge-preserving denoise settings (see denoise). */
export const DENOISE = { radiusPx: 2, rangeDeltaE: 10 }
/** Colours are found on this many random pixels. */
export const SAMPLE_COUNT = 20_000
/** An outline colour this close (deltaE) to a palette colour reuses that colour. */
const SAME_COLOUR_DELTA_E = 3

export type PipelineInput = {
  image: ImageGrid
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
  seed: number
}

export type PipelineResult = {
  /** Colours, lightest first; the index is the label in `map`. An outline colour may be last. */
  palette: OKLab[]
  /** "This art has N colours". */
  suggestedCount: number
  /** The cleaned colour map, 1 mm per pixel, the size of the rug. */
  map: LabelMap
  pattern: VectorPattern
  /** Lines thinner than minDetailMm: warnings, never deleted. */
  thin: ThinPart[]
  /** A palette label that already works as outlines in the art, or null. */
  outlineSuggestion: number | null
  /** How many found colours were merged into others: found = palette.length + mergedAway. */
  mergedAway: number
}

/** The image stages' results: they depend only on the image, the rug size and the seed. */
export type PreparedImage = {
  /** The image at rug size (1 mm per pixel), denoised. */
  clean: ImageGrid
  samples: OKLab[]
  suggestedCount: number
  /** How big one pixel of the original image is on the rug (mm). */
  sourcePxMm: number
}

/**
 * The whole image pipeline, from an image to a vector pattern:
 * fit to the rug → denoise → sample → peaks → suggested count (prepareImage), then
 * palette → colour map → merges → outlines (only if turned on) → merge small islands →
 * thicken chosen colours → thin-line warnings → vector pattern (finishPipeline).
 */
export function runPipeline(input: PipelineInput): PipelineResult {
  return finishPipeline(prepareImage(input), input)
}

/** The stages that depend only on the image, the rug size and the seed. */
export function prepareImage(input: Pick<PipelineInput, 'image' | 'rug' | 'seed'>): PreparedImage {
  const clean = denoise(fitToRug(input.image, input.rug, FINE_MM_PER_PX), DENOISE)
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
  }
}

/** The stages that depend on the colour settings: everything from the palette on. */
export function finishPipeline(prepared: PreparedImage, input: PipelineInput): PipelineResult {
  const { clean, samples, suggestedCount, sourcePxMm } = prepared
  const found = findPalette(samples, {
    count: input.count ?? suggestedCount,
    locked: input.locked,
    seed: input.seed,
  })

  const merged = applyMerges(assignLabels(clean, found, FINE_MM_PER_PX), found, input.merges)
  const mergedAway = found.length - merged.palette.length
  const palette = [...merged.palette] // a copy: an outline colour may be added below
  let map = merged.map
  const outlineSuggestion = suggestOutlines(map, palette)

  if (input.outlines) {
    const { colour, widthMm, where } = input.outlines
    let label = palette.findIndex((p) => deltaE(p, colour) < SAME_COLOUR_DELTA_E)
    if (label === -1) {
      palette.push(colour)
      label = palette.length - 1
    }
    map = addOutlines(map, { widthMm, label, where })
  }

  map = mergeSmallIslands(map, input.minDetailMm * input.minDetailMm)
  for (const colour of input.thicken) {
    const label = palette.findIndex((p) => deltaE(p, colour) < SAME_COLOUR_DELTA_E)
    if (label !== -1) map = thickenLabel(map, label, input.minDetailMm)
  }
  const thin = findThinParts(map, input.minDetailMm)
  const pattern = buildPattern(map, input.rug, { sourcePxMm })

  return { palette, suggestedCount, map, pattern, thin, outlineSuggestion, mergedAway }
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
