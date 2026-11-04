// Shared types for the whole app. Every task uses these exact names (see docs/plan.md).

export type RGB = { r: number; g: number; b: number } // 0–255
export type OKLab = { L: number; a: number; b: number }
export type Pt = { x: number; y: number } // mm

export type ImageGrid = { width: number; height: number; data: Uint8ClampedArray } // RGBA
export type RugSize = { widthMm: number; heightMm: number }

export const NO_LABEL = 255 // outside the rug
export type LabelMap = { width: number; height: number; mmPerPx: number; labels: Uint8Array }

export type PaletteEntry = {
  number: number
  name: string
  lab: OKLab
  hex: string
  locked: boolean
  yarnId?: string
}

export type PathSeg = { kind: 'line'; to: Pt } | { kind: 'cubic'; c1: Pt; c2: Pt; to: Pt }
export type Edge = { id: number; left: number; right: number; start: Pt; segs: PathSeg[] }
export type RingRef = { edgeId: number; reversed: boolean }[]
export type Region = { id: number; label: number; rings: RingRef[] }
export type VectorPattern = { rug: RugSize; edges: Edge[]; regions: Region[] }

export type Yarn = {
  id: string
  list: 'stock' | 'catalogue'
  name: string
  number: string
  hex: string
  photo?: Blob
  gramsOnHand?: number
  coneWeightG?: number
  shop?: string
}

export type Calibration = {
  id: string
  name: string
  gramsPerM2: number
  waste: number
  wasteHistory: number[]
}
