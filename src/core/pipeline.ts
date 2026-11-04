import { deltaE } from './color/distance'
import { mergeSmallIslands } from './cleanup/islands'
import { type OutlineWhere, addOutlines, suggestOutlines } from './cleanup/outlines'
import { type ThinPart, findThinParts } from './cleanup/thin'
import { denoise } from './image/denoise'
import { fitToRug } from './image/fitToRug'
import { FINE_MM_PER_PX, assignLabels } from './quantize/assign'
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
}

/**
 * The whole image pipeline, from an image to a vector pattern:
 * fit to the rug → denoise → sample → peaks → suggested count → palette → colour map →
 * outlines (only if turned on) → merge small islands → thin-line warnings → vector pattern.
 */
export function runPipeline(input: PipelineInput): PipelineResult {
  const fitted = fitToRug(input.image, input.rug, FINE_MM_PER_PX)
  const clean = denoise(fitted, DENOISE)

  const samples = samplePixels(clean, SAMPLE_COUNT, input.seed)
  const suggestedCount = suggestCount(findPeaks(samples))
  const palette = findPalette(samples, {
    count: input.count ?? suggestedCount,
    locked: input.locked,
    seed: input.seed,
  })

  let map = assignLabels(clean, palette, FINE_MM_PER_PX)
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
  const thin = findThinParts(map, input.minDetailMm)
  // How big one pixel of the original image is on the rug (fitToRug scales by the smaller ratio).
  const sourcePxMm = Math.min(
    input.rug.widthMm / input.image.width,
    input.rug.heightMm / input.image.height,
  )
  const pattern = buildPattern(map, input.rug, { sourcePxMm })

  return { palette, suggestedCount, map, pattern, thin, outlineSuggestion }
}
