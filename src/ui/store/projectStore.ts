import { createStore } from 'zustand/vanilla'
import { oklabToSrgb, rgbToHex } from '../../core/color/convert'
import { deltaE } from '../../core/color/distance'
import type { PipelineResult } from '../../core/pipeline'
import type { ImageGrid, OKLab, PaletteEntry, RugSize } from '../../core/types'

export const STEPS = ['setup', 'colours', 'outline', 'preview', 'yarn', 'projector'] as const
export type Step = (typeof STEPS)[number]

/** The uploaded image, already capped in size (see loadImageFile). */
export type Source = { grid: ImageGrid; name: string; downscaled: boolean }

export type ProjectState = {
  source: Source | null
  rug: RugSize
  shape: 'shaped' | 'rectangle'
  /** Colours wanted; null = use the suggested count. */
  count: number | null
  minDetailMm: number
  palette: PaletteEntry[]
  result: PipelineResult | null
  step: Step
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
}

export type ProjectStore = ReturnType<typeof createProjectStore>

/** Default minimum detail until the right value for the gun is known (open question in the spec). */
export const DEFAULT_MIN_DETAIL_MM = 10
/** A new colour this close (deltaE) to an old one keeps the old one's name and lock. */
const SAME_COLOUR_DELTA_E = 3

const initialState: ProjectState = {
  source: null,
  rug: { widthMm: 1000, heightMm: 1000 },
  shape: 'shaped',
  count: null,
  minDetailMm: DEFAULT_MIN_DETAIL_MM,
  palette: [],
  result: null,
  step: 'setup',
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
        // A new image starts its colours from scratch.
        set({ source, palette: [], result: null, count: null })
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
        set({ result, palette: paletteFrom(result.palette, get().palette) })
        keepStepValid()
      },
      setStep(step) {
        if (availableSteps(get()).includes(step)) set({ step })
      },
      toggleLock: (number) =>
        set({
          palette: get().palette.map((p) =>
            p.number === number ? { ...p, locked: !p.locked } : p,
          ),
        }),
      renameColour: (number, name) =>
        set({ palette: get().palette.map((p) => (p.number === number ? { ...p, name } : p)) }),
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
function paletteFrom(colours: OKLab[], previous: PaletteEntry[]): PaletteEntry[] {
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
      name: match?.name ?? `Colour ${i + 1}`,
      lab,
      hex: rgbToHex(oklabToSrgb(lab)),
      locked: match?.locked ?? false,
      ...(match?.yarnId ? { yarnId: match.yarnId } : {}),
    }
  })
}
