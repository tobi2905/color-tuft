import { describe, expect, it } from 'vitest'
import type { Yarn } from '../../src/core/types'
import {
  type YarnDraft,
  draftFromYarn,
  draftToYarn,
  emptyDraft,
  yarnDraftErrors,
} from '../../src/ui/yarn/yarnDraft'

const draft = (change: Partial<YarnDraft> = {}): YarnDraft => ({
  ...emptyDraft(),
  name: 'Poppy red',
  number: '12',
  hex: '#d62828',
  ...change,
})

describe('yarn form draft', () => {
  it('accepts a complete draft', () => {
    expect(Object.values(yarnDraftErrors(draft())).every((e) => e === null)).toBe(true)
  })

  it('needs a name', () => {
    expect(yarnDraftErrors(draft({ name: '  ' })).name).not.toBeNull()
  })

  it('needs a colour code as #RRGGBB', () => {
    expect(yarnDraftErrors(draft({ hex: 'red' })).hex).not.toBeNull()
    expect(yarnDraftErrors(draft({ hex: '#FFF' })).hex).not.toBeNull()
    expect(yarnDraftErrors(draft({ hex: 'D62828' })).hex).toBeNull() // the # is optional
  })

  it('allows empty grams but not negative or non-numbers', () => {
    expect(yarnDraftErrors(draft({ gramsOnHand: '' })).gramsOnHand).toBeNull()
    expect(yarnDraftErrors(draft({ gramsOnHand: '-5' })).gramsOnHand).not.toBeNull()
    expect(yarnDraftErrors(draft({ coneWeightG: 'lots' })).coneWeightG).not.toBeNull()
    expect(yarnDraftErrors(draft({ coneWeightG: '0' })).coneWeightG).not.toBeNull() // a cone weighs something
  })

  it('turns a draft into a yarn: trimmed text, upper-case hex, numbers, empty fields left out', () => {
    const yarn = draftToYarn(
      draft({ name: ' Poppy red ', gramsOnHand: '350,5', coneWeightG: '', shop: ' ' }),
      'stock',
    )
    expect(yarn).toEqual({
      list: 'stock',
      name: 'Poppy red',
      number: '12',
      hex: '#D62828',
      gramsOnHand: 350.5,
    })
  })

  it('round-trips a yarn through the form', () => {
    const yarn: Yarn = {
      id: 'y1',
      list: 'catalogue',
      name: 'Ocean',
      number: '40',
      hex: '#1D4E89',
      coneWeightG: 1000,
      shop: 'Tuft shop',
    }
    const { id: _, ...rest } = yarn
    expect(draftToYarn(draftFromYarn(yarn), 'catalogue')).toEqual(rest)
  })
})
