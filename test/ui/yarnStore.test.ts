import { describe, expect, it } from 'vitest'
import type { Yarn } from '../../src/core/types'
import { createYarnStore } from '../../src/ui/store/yarnStore'

const red: Omit<Yarn, 'id'> = {
  list: 'stock',
  name: 'Poppy red',
  number: '12',
  hex: '#D62828',
  gramsOnHand: 350,
  coneWeightG: 400,
}
const blue: Omit<Yarn, 'id'> = {
  list: 'catalogue',
  name: 'Ocean',
  number: '40',
  hex: '#1D4E89',
  coneWeightG: 1000,
  shop: 'Tuft shop',
}

describe('yarn store', () => {
  it('starts empty', () => {
    expect(createYarnStore().getState().yarns).toEqual([])
  })

  it('adds a yarn with a new id and returns that id', () => {
    const store = createYarnStore()
    const a = store.getState().addYarn(red)
    const b = store.getState().addYarn(blue)
    expect(a).not.toBe(b)
    expect(store.getState().yarns).toEqual([
      { ...red, id: a },
      { ...blue, id: b },
    ])
  })

  it('adding then removing leaves the list unchanged', () => {
    const store = createYarnStore()
    store.getState().addYarn(red)
    const before = store.getState().yarns
    const id = store.getState().addYarn(blue)
    store.getState().removeYarn(id)
    expect(store.getState().yarns).toEqual(before)
  })

  it('updates only the fields given, on only that yarn', () => {
    const store = createYarnStore()
    const a = store.getState().addYarn(red)
    const b = store.getState().addYarn(blue)
    store.getState().updateYarn(a, { name: 'Cherry', gramsOnHand: 120 })
    expect(store.getState().yarns).toEqual([
      { ...red, id: a, name: 'Cherry', gramsOnHand: 120 },
      { ...blue, id: b },
    ])
  })

  it('clears an optional field updated to undefined', () => {
    const store = createYarnStore()
    const a = store.getState().addYarn(red)
    store.getState().updateYarn(a, { gramsOnHand: undefined })
    expect('gramsOnHand' in store.getState().yarns[0]).toBe(false)
  })

  it('addToStock copies a catalogue yarn into stock and keeps it in the catalogue', () => {
    const store = createYarnStore()
    const id = store.getState().addYarn(blue)
    const stockId = store.getState().addToStock(id, 1000)!
    expect(stockId).not.toBe(id)
    expect(store.getState().yarns).toEqual([
      { ...blue, id },
      { ...blue, id: stockId, list: 'stock', gramsOnHand: 1000, fromCatalogue: id },
    ])
  })

  it('adding the same catalogue yarn again tops up its stock copy', () => {
    const store = createYarnStore()
    const id = store.getState().addYarn(blue)
    const first = store.getState().addToStock(id, 1000)
    const second = store.getState().addToStock(id, 500)
    expect(second).toBe(first)
    const stock = store.getState().yarns.filter((y) => y.list === 'stock')
    expect(stock).toHaveLength(1)
    expect(stock[0].gramsOnHand).toBe(1500)
  })

  it('adds to stock without grams when none are given', () => {
    const store = createYarnStore()
    const id = store.getState().addYarn(blue)
    store.getState().addToStock(id)
    expect('gramsOnHand' in store.getState().yarns[1]).toBe(false)
  })

  it('does not add stock yarns to stock again', () => {
    const store = createYarnStore()
    const id = store.getState().addYarn(red)
    expect(store.getState().addToStock(id, 100)).toBeNull()
    expect(store.getState().yarns).toHaveLength(1)
  })

  it('ignores unknown ids', () => {
    const store = createYarnStore()
    store.getState().addYarn(red)
    const before = store.getState().yarns
    store.getState().updateYarn('nope', { name: 'x' })
    store.getState().removeYarn('nope')
    expect(store.getState().addToStock('nope', 100)).toBeNull()
    expect(store.getState().yarns).toEqual(before)
  })
})
