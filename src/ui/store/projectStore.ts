import { createStore } from 'zustand/vanilla'
import { oklabToSrgb, rgbToHex } from '../../core/color/convert'
import { deltaE } from '../../core/color/distance'
import type { PipelineResult } from '../../core/pipeline'
import type { BackgroundEdit } from '../../core/outline/backgroundEdits'
import type { ImageGrid, OKLab, PaletteEntry, Pt, RugSize } from '../../core/types'
import type { LayerOptions } from '../../render/projector/layers'
import { calibrationFactor } from '../../render/projector/transform'

export const STEPS = ['setup', 'colours', 'outline', 'preview', 'yarn', 'projector'] as const
export type Step = (typeof STEPS)[number]

/** The uploaded image, already capped in size (see loadImageFile). */
export type Source = { grid: ImageGrid; name: string; downscaled: boolean }

/** A colour merged into another, with what the merged colour looked like (for the undo list). */
export type MergeRecord = { from: OKLab; into: OKLab; fromName: string; fromHex: string }

/** Separation outlines: off by default for every image. colour null = the darkest palette colour. */
export type OutlineSettings = {
  enabled: boolean
  widthMm: number
  colour: OKLab | null
  where: 'all' | 'outer'
}

export type ProjectState = {
  source: Source | null
  /** Counts uploads, so every image (even the same file again) is a new one for the cache. */
  sourceId: number
  rug: RugSize
  shape: 'shaped' | 'rectangle'
  /** Colours wanted; null = use the suggested count. */
  count: number | null
  minDetailMm: number
  palette: PaletteEntry[]
  result: PipelineResult | null
  step: Step
  outlines: OutlineSettings
  /** Colours whose thin lines are thickened to the minimum detail. */
  thicken: OKLab[]
  /** Colours merged into others, in the order chosen. */
  merges: MergeRecord[]
  /** Colours picked from the image (eyedropper): kept locked until unlocked. */
  picked: OKLab[]
  /** Shaped rugs: border beyond the art and rounding of inner corners (mm). */
  offsetMm: number
  smoothMm: number
  /** Shaped rugs: clicks turning areas into background or back into art. */
  backgroundEdits: BackgroundEdit[]
  /** Border yarn (shaped) and background yarn (rectangle); null = automatic. */
  borderColour: OKLab | null
  backgroundColour: OKLab | null
  /** Projector: starting scale (screen px per mm, set once), calibration correction, nudge
   *  (px) and mirroring (on by default: tufting is done from the back of the cloth). */
  projector: {
    pxPerMm: number | null
    factor: number
    offsetPx: Pt
    mirror: boolean
    /** Which pattern layers the projector shows. */
    layers: LayerOptions
    /** One colour at a time: the label shown lit up, or null for all colours. */
    focus: number | null
  }
}

export type ProjectActions = {
  setSource(source: Source): void
  setRug(rug: RugSize): void
  setShape(shape: 'shaped' | 'rectangle'): void
  setCount(count: number | null): void
  setMinDetail(mm: number): void
  setResult(result: PipelineResult): void
  setStep(step: Step): void
  toggleLock(number: number): void
  renameColour(number: number, name: string): void
  setOutlines(change: Partial<OutlineSettings>): void
  toggleThicken(colour: OKLab): void
  mergeColour(fromNumber: number, intoNumber: number): void
  undoMerge(index: number): void
  addPickedColour(colour: OKLab): void
  setRugEdge(change: { offsetMm?: number; smoothMm?: number }): void
  addBackgroundEdit(edit: BackgroundEdit): void
  undoBackgroundEdit(index: number): void
  setBorderColour(colour: OKLab | null): void
  setBackgroundColour(colour: OKLab | null): void
  initProjectorScale(pxPerMm: number): void
  applyMeasurement(measuredMm: number): void
  resetCalibration(): void
  nudge(dx: number, dy: number): void
  setMirror(mirror: boolean): void
  setLayers(change: Partial<LayerOptions>): void
  setFocus(label: number | null): void
}

export type ProjectStore = ReturnType<typeof createProjectStore>

/** Default minimum detail until the right value for the gun is known (open question in the spec). */
export const DEFAULT_MIN_DETAIL_MM = 10
/** A new colour this close (deltaE) to an old one keeps the old one's name and lock. */
const SAME_COLOUR_DELTA_E = 3

const initialState: ProjectState = {
  source: null,
  sourceId: 0,
  rug: { widthMm: 1000, heightMm: 1000 },
  shape: 'shaped',
  count: null,
  minDetailMm: DEFAULT_MIN_DETAIL_MM,
  palette: [],
  result: null,
  step: 'setup',
  outlines: { enabled: false, widthMm: 10, colour: null, where: 'all' },
  thicken: [],
  merges: [],
  picked: [],
  offsetMm: 20,
  smoothMm: 10,
  backgroundEdits: [],
  borderColour: null,
  backgroundColour: null,
  projector: {
    pxPerMm: null,
    factor: 1,
    offsetPx: { x: 0, y: 0 },
    mirror: true,
    layers: { outlines: true, lineWidthPx: 2, numbers: true, fontMm: 30, cut: true, grid: false },
    focus: null,
  },
}

/**
 * The project being worked on, and everything that changes it. Plain Zustand store (no React),
 * so it is testable in Node; components use it through useProjectStore.
 */
export function createProjectStore() {
  return createStore<ProjectState & ProjectActions>()((set, get) => {
    /** After a change: if the current step is no longer available, go to the nearest one before it. */
    const keepStepValid = () => {
      const state = get()
      const available = availableSteps(state)
      if (available.includes(state.step)) return
      const earlier = STEPS.slice(0, STEPS.indexOf(state.step)).reverse()
      set({ step: earlier.find((s) => available.includes(s)) ?? 'setup' })
    }

    return {
      ...initialState,

      setSource(source) {
        // A new image starts its colours from scratch; outlines are off again (the spec: never
        // applied to every artwork), but the chosen width and placement are remembered.
        set({
          source,
          sourceId: get().sourceId + 1,
          palette: [],
          result: null,
          count: null,
          thicken: [],
          merges: [],
          picked: [],
          backgroundEdits: [],
          outlines: { ...get().outlines, enabled: false, colour: null },
        })
        keepStepValid()
      },
      setRug: (rug) => set({ rug }),
      setShape(shape) {
        set({ shape })
        keepStepValid()
      },
      setCount: (count) =>
        set({ count: count === null ? null : Math.min(16, Math.max(1, Math.round(count))) }),
      setMinDetail: (mm) => set({ minDetailMm: mm }),
      setResult(result) {
        const palette = paletteFrom(result.palette, get().palette, result).map((p) =>
          isPicked(get().picked, p.lab) ? { ...p, locked: true } : p,
        )
        set({ result, palette })
        keepStepValid()
      },
      setStep(step) {
        if (availableSteps(get()).includes(step)) set({ step })
      },
      toggleLock(number) {
        const entry = get().palette.find((p) => p.number === number)
        if (!entry) return
        set({
          palette: get().palette.map((p) =>
            p.number === number ? { ...p, locked: !p.locked } : p,
          ),
          // Unlocking a picked colour releases it.
          picked: entry.locked
            ? get().picked.filter((c) => !isPicked([c], entry.lab))
            : get().picked,
        })
      },
      addPickedColour(colour) {
        const { palette, picked, count, result } = get()
        const existing = palette.find((p) => deltaE(p.lab, colour) < SAME_COLOUR_DELTA_E)
        if (existing) {
          // Already in the palette: just make sure it stays.
          if (!existing.locked) get().toggleLock(existing.number)
          return
        }
        const found = count ?? result?.suggestedCount ?? palette.length
        set({ picked: [...picked, colour], count: Math.min(16, found + 1) })
      },
      renameColour: (number, name) =>
        set({ palette: get().palette.map((p) => (p.number === number ? { ...p, name } : p)) }),
      setOutlines: (change) => set({ outlines: { ...get().outlines, ...change } }),
      setRugEdge: (change) => set(change),
      addBackgroundEdit: (edit) => set({ backgroundEdits: [...get().backgroundEdits, edit] }),
      undoBackgroundEdit: (index) =>
        set({ backgroundEdits: get().backgroundEdits.filter((_, i) => i !== index) }),
      setBorderColour: (borderColour) => set({ borderColour }),
      initProjectorScale(pxPerMm) {
        if (get().projector.pxPerMm === null) set({ projector: { ...get().projector, pxPerMm } })
      },
      applyMeasurement(measuredMm) {
        // The bar was drawn 100 mm long with the current factor: correct on top of it.
        const projector = get().projector
        set({
          projector: {
            ...projector,
            factor: projector.factor * calibrationFactor(100, measuredMm),
          },
        })
      },
      resetCalibration: () =>
        set({ projector: { ...get().projector, factor: 1, offsetPx: { x: 0, y: 0 } } }),
      nudge(dx, dy) {
        const projector = get().projector
        set({
          projector: {
            ...projector,
            offsetPx: { x: projector.offsetPx.x + dx, y: projector.offsetPx.y + dy },
          },
        })
      },
      setMirror: (mirror) => set({ projector: { ...get().projector, mirror } }),
      setFocus: (focus) => set({ projector: { ...get().projector, focus } }),
      setLayers: (change) =>
        set({
          projector: { ...get().projector, layers: { ...get().projector.layers, ...change } },
        }),
      setBackgroundColour: (backgroundColour) => set({ backgroundColour }),
      mergeColour(fromNumber, intoNumber) {
        const palette = get().palette
        const from = palette.find((p) => p.number === fromNumber)
        const into = palette.find((p) => p.number === intoNumber)
        if (!from || !into || from === into) return
        const record = { from: from.lab, into: into.lab, fromName: from.name, fromHex: from.hex }
        set({ merges: [...get().merges, record] })
      },
      undoMerge: (index) => set({ merges: get().merges.filter((_, i) => i !== index) }),
      toggleThicken(colour) {
        const thicken = get().thicken
        const i = thicken.findIndex((c) => deltaE(c, colour) < SAME_COLOUR_DELTA_E)
        set({ thicken: i === -1 ? [...thicken, colour] : thicken.filter((_, j) => j !== i) })
      },
    }
  })
}

/**
 * Steps that have the data they need: Colours needs an image; the rest need a result;
 * Outline only exists for shaped rugs.
 */
export function availableSteps(state: Pick<ProjectState, 'source' | 'result' | 'shape'>): Step[] {
  return STEPS.filter((step) => {
    if (step === 'setup') return true
    if (step === 'colours') return state.source !== null
    if (step === 'outline') return state.result !== null && state.shape === 'shaped'
    return state.result !== null
  })
}

/**
 * Numbered palette entries for the pipeline's colours (lightest first). A colour close to one
 * already in the palette keeps its name and lock, so re-running doesn't lose the user's edits.
 */
function paletteFrom(
  colours: OKLab[],
  previous: PaletteEntry[],
  result?: Pick<PipelineResult, 'roles' | 'rolesAdded'>,
): PaletteEntry[] {
  // Only colours added for the border or background are named after it; an art colour
  // reused as the border keeps its own name.
  const roleName = (i: number) =>
    result?.roles?.border === i && result.rolesAdded?.border
      ? 'Border'
      : result?.roles?.background === i && result.rolesAdded?.background
        ? 'Background'
        : null
  const claimed = new Set<PaletteEntry>()
  return colours.map((lab, i) => {
    let match: PaletteEntry | undefined
    let best = SAME_COLOUR_DELTA_E
    for (const p of previous) {
      const d = deltaE(p.lab, lab)
      if (!claimed.has(p) && d < best) {
        best = d
        match = p
      }
    }
    if (match) claimed.add(match)
    return {
      number: i + 1,
      name: match?.name ?? roleName(i) ?? `Colour ${i + 1}`,
      lab,
      hex: rgbToHex(oklabToSrgb(lab)),
      locked: match?.locked ?? false,
      ...(match?.yarnId ? { yarnId: match.yarnId } : {}),
    }
  })
}

function isPicked(picked: OKLab[], colour: OKLab): boolean {
  return picked.some((c) => deltaE(c, colour) < SAME_COLOUR_DELTA_E)
}
