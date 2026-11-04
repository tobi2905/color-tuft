import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../src/core/color/convert'
import type { PipelineResult } from '../../src/core/pipeline'
import type { OKLab } from '../../src/core/types'
import { type Source, availableSteps, createProjectStore } from '../../src/ui/store/projectStore'

const source = (name = 'art.png'): Source => ({
  grid: { width: 2, height: 2, data: new Uint8ClampedArray(16) },
  name,
  downscaled: false,
})
const resultWith = (palette: OKLab[]) =>
  ({ palette, suggestedCount: palette.length }) as PipelineResult
const gold = srgbToOklab({ r: 255, g: 215, b: 0 })
const dark = srgbToOklab({ r: 27, g: 27, b: 27 })
const red = srgbToOklab({ r: 214, g: 40, b: 40 })

describe('project store', () => {
  it('starts with no image, a shaped rug, the suggested colour count and the setup step', () => {
    const s = createProjectStore().getState()
    expect(s.source).toBeNull()
    expect(s.shape).toBe('shaped')
    expect(s.count).toBeNull() // null = use the suggested count
    expect(s.palette).toEqual([])
    expect(s.step).toBe('setup')
    expect(s.minDetailMm).toBe(10)
  })

  it('stores the colour count', () => {
    const store = createProjectStore()
    store.getState().setCount(5)
    expect(store.getState().count).toBe(5)
    store.getState().setCount(null)
    expect(store.getState().count).toBeNull()
  })

  it('keeps the colour count a whole number from 1 to 16', () => {
    const store = createProjectStore()
    store.getState().setCount(3.6)
    expect(store.getState().count).toBe(4)
    store.getState().setCount(40)
    expect(store.getState().count).toBe(16)
    store.getState().setCount(0)
    expect(store.getState().count).toBe(1)
  })

  it('resets palette, result and colour count when the image changes', () => {
    const store = createProjectStore()
    store.getState().setSource(source('first.png'))
    store.getState().setCount(5)
    store.getState().setResult(resultWith([gold, dark]))
    store.getState().setSource(source('second.png'))
    const s = store.getState()
    expect(s.source?.name).toBe('second.png')
    expect(s.palette).toEqual([])
    expect(s.result).toBeNull()
    expect(s.count).toBeNull()
  })

  it('turns a result into a numbered, named palette', () => {
    const store = createProjectStore()
    store.getState().setResult(resultWith([gold, dark]))
    const palette = store.getState().palette
    expect(palette.map((p) => [p.number, p.name, p.hex, p.locked])).toEqual([
      [1, 'Colour 1', '#FFD700', false],
      [2, 'Colour 2', '#1B1B1B', false],
    ])
    expect(palette[0].lab).toEqual(gold)
  })

  it('keeps names and locks of colours that are still there after a new result', () => {
    const store = createProjectStore()
    store.getState().setResult(resultWith([gold, dark]))
    store.getState().renameColour(2, 'Midnight')
    store.getState().toggleLock(2)
    // The new result has a red in front: dark moves to number 3, but keeps its name and lock.
    store.getState().setResult(resultWith([gold, red, dark]))
    const darkEntry = store.getState().palette.find((p) => p.hex === '#1B1B1B')!
    expect([darkEntry.number, darkEntry.name, darkEntry.locked]).toEqual([3, 'Midnight', true])
    expect(store.getState().palette[1].name).toBe('Colour 2') // red is new
  })

  it('only allows steps that have their data', () => {
    const store = createProjectStore()
    expect(availableSteps(store.getState())).toEqual(['setup'])
    store.getState().setSource(source())
    expect(availableSteps(store.getState())).toEqual(['setup', 'colours'])
    store.getState().setResult(resultWith([gold, dark]))
    expect(availableSteps(store.getState())).toEqual([
      'setup',
      'colours',
      'outline',
      'preview',
      'yarn',
      'projector',
    ])
  })

  it('has no outline step for a rectangular rug', () => {
    const store = createProjectStore()
    store.getState().setSource(source())
    store.getState().setResult(resultWith([gold, dark]))
    store.getState().setShape('rectangle')
    expect(availableSteps(store.getState())).not.toContain('outline')
  })

  it('ignores a step that is not available yet', () => {
    const store = createProjectStore()
    store.getState().setStep('projector')
    expect(store.getState().step).toBe('setup')
    store.getState().setSource(source())
    store.getState().setStep('colours')
    expect(store.getState().step).toBe('colours')
  })

  it('goes back to the nearest step still available when a new image clears the result', () => {
    const store = createProjectStore()
    store.getState().setSource(source())
    store.getState().setResult(resultWith([gold, dark]))
    store.getState().setStep('preview')
    store.getState().setSource(source('other.png'))
    expect(store.getState().step).toBe('colours') // the new image is there; its colours follow
  })

  it('leaves the outline step when the rug becomes rectangular', () => {
    const store = createProjectStore()
    store.getState().setSource(source())
    store.getState().setResult(resultWith([gold, dark]))
    store.getState().setStep('outline')
    store.getState().setShape('rectangle')
    expect(store.getState().step).toBe('colours')
  })

  it('has outlines off by default, and turns them off again for a new image', () => {
    const store = createProjectStore()
    expect(store.getState().outlines).toEqual({
      enabled: false,
      widthMm: 10,
      colour: null,
      where: 'all',
    })
    store.getState().setOutlines({ enabled: true, widthMm: 15 })
    expect(store.getState().outlines).toMatchObject({ enabled: true, widthMm: 15, where: 'all' })
    store.getState().setSource(source('new.png'))
    expect(store.getState().outlines.enabled).toBe(false)
    expect(store.getState().outlines.widthMm).toBe(15) // the chosen width is remembered
  })

  it('toggles which colours are thickened, and forgets them for a new image', () => {
    const store = createProjectStore()
    store.getState().toggleThicken(dark)
    store.getState().toggleThicken(gold)
    expect(store.getState().thicken).toEqual([dark, gold])
    store.getState().toggleThicken(dark)
    expect(store.getState().thicken).toEqual([gold])
    store.getState().setSource(source())
    expect(store.getState().thicken).toEqual([])
  })

  it('remembers a merge by colour, with the merged colour name for the undo list', () => {
    const store = createProjectStore()
    store.getState().setResult(resultWith([gold, red, dark]))
    store.getState().renameColour(2, 'Fiery')
    store.getState().mergeColour(2, 3)
    expect(store.getState().merges).toEqual([
      { from: red, into: dark, fromName: 'Fiery', fromHex: store.getState().palette[1].hex },
    ])
  })

  it('ignores merging a colour into itself or into a number that does not exist', () => {
    const store = createProjectStore()
    store.getState().setResult(resultWith([gold, dark]))
    store.getState().mergeColour(1, 1)
    store.getState().mergeColour(1, 9)
    expect(store.getState().merges).toEqual([])
  })

  it('undoes a merge, and forgets all merges for a new image', () => {
    const store = createProjectStore()
    store.getState().setResult(resultWith([gold, red, dark]))
    store.getState().mergeColour(2, 3)
    store.getState().mergeColour(1, 3)
    store.getState().undoMerge(0)
    expect(store.getState().merges.map((m) => m.from)).toEqual([gold])
    store.getState().setSource(source())
    expect(store.getState().merges).toEqual([])
  })

  it('adds a picked colour as a locked colour and raises the count by one', () => {
    const store = createProjectStore()
    store.getState().setSource(source())
    store.getState().setResult(resultWith([gold, dark]))
    store.getState().addPickedColour(red)
    expect(store.getState().picked).toEqual([red])
    expect(store.getState().count).toBe(3) // the suggested 2, plus one
    store.getState().setResult(resultWith([gold, red, dark]))
    expect(store.getState().palette.find((p) => p.hex === '#D62828')?.locked).toBe(true)
  })

  it('locks the existing colour instead when the picked one is practically the same', () => {
    const store = createProjectStore()
    store.getState().setResult(resultWith([gold, dark]))
    store.getState().addPickedColour({ ...dark, L: dark.L + 0.005 })
    expect(store.getState().picked).toEqual([])
    expect(store.getState().palette[1].locked).toBe(true)
    expect(store.getState().count).toBeNull()
  })

  it('releases a picked colour when it is unlocked, and forgets picks for a new image', () => {
    const store = createProjectStore()
    store.getState().setSource(source())
    store.getState().setResult(resultWith([gold, dark]))
    store.getState().addPickedColour(red)
    store.getState().setResult(resultWith([gold, red, dark]))
    store.getState().toggleLock(2) // the red
    expect(store.getState().picked).toEqual([])
    store.getState().addPickedColour(red)
    store.getState().setSource(source('other.png'))
    expect(store.getState().picked).toEqual([])
  })
})
