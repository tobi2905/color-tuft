import { describe, expect, it } from 'vitest'
import { buildPattern } from '../../src/core/trace/pattern'
import { coloursInPattern, focusRegions, stepFocus } from '../../src/render/projector/focus'
import { FIXTURE, triforce } from '../fixtures/images'

/** The Triforce as a pattern: gold = label 0 (colour 1), dark = label 1 (colour 2). */
function triforcePattern() {
  const img = triforce(200)
  const labels = new Uint8Array(200 * 200)
  for (let p = 0; p < labels.length; p++) labels[p] = img.data[p * 4] === FIXTURE.gold.r ? 0 : 1
  return buildPattern(
    { width: 200, height: 200, mmPerPx: 1, labels },
    { widthMm: 200, heightMm: 200 },
  )
}

describe('coloursInPattern', () => {
  it('lists each colour used once, in palette order', () => {
    expect(coloursInPattern(triforcePattern())).toEqual([0, 1])
  })
})

describe('stepFocus', () => {
  it('starts at the first colour, then steps forward and wraps round', () => {
    expect(stepFocus(null, [0, 2, 5], 1)).toBe(0)
    expect(stepFocus(0, [0, 2, 5], 1)).toBe(2)
    expect(stepFocus(5, [0, 2, 5], 1)).toBe(0)
  })

  it('steps backward and wraps round', () => {
    expect(stepFocus(null, [0, 2, 5], -1)).toBe(5)
    expect(stepFocus(0, [0, 2, 5], -1)).toBe(5)
    expect(stepFocus(2, [0, 2, 5], -1)).toBe(0)
  })

  it('starts again when the current colour is gone (e.g. after a merge)', () => {
    expect(stepFocus(3, [0, 2, 5], 1)).toBe(0)
  })

  it('gives null when there are no colours', () => {
    expect(stepFocus(null, [], 1)).toBeNull()
  })
})

describe('focusRegions', () => {
  it('lights up exactly the 3 gold triangles for colour 1, then the background for colour 2', () => {
    const pattern = triforcePattern()
    const gold = focusRegions(pattern, 0)
    expect(gold).toHaveLength(3)
    for (const i of gold) expect(pattern.regions[i].label).toBe(0)
    const dark = focusRegions(pattern, stepFocus(0, coloursInPattern(pattern), 1)!)
    expect(dark).toHaveLength(1)
    expect(pattern.regions[dark[0]].label).toBe(1)
  })
})
