import { describe, expect, it } from 'vitest'
import { srgbToOklab } from '../../../src/core/color/convert'
import { applyMerges } from '../../../src/core/quantize/merge'
import { NO_LABEL } from '../../../src/core/types'

const green = srgbToOklab({ r: 40, g: 160, b: 70 })
const grey = srgbToOklab({ r: 60, g: 60, b: 60 })
const black = srgbToOklab({ r: 10, g: 10, b: 10 })
const palette = [green, grey, black] // labels 0, 1, 2

// A row: green, grey, black, grey, outside.
const map = () => ({
  width: 5,
  height: 1,
  mmPerPx: 1,
  labels: new Uint8Array([0, 1, 2, 1, NO_LABEL]),
})

describe('applyMerges', () => {
  it('turns every pixel of one colour into another and drops it from the palette', () => {
    const out = applyMerges(map(), palette, [{ from: grey, into: black }])
    expect(out.palette).toEqual([green, black])
    expect(Array.from(out.map.labels)).toEqual([0, 1, 1, 1, NO_LABEL])
  })

  it('finds the colours by look, even when they shifted a little since the merge was chosen', () => {
    const slightlyOffGrey = srgbToOklab({ r: 64, g: 62, b: 60 })
    const out = applyMerges(map(), palette, [{ from: slightlyOffGrey, into: black }])
    expect(out.palette).toEqual([green, black])
  })

  it('changes nothing when a colour of the merge is no longer there', () => {
    const red = srgbToOklab({ r: 214, g: 40, b: 40 })
    const out = applyMerges(map(), palette, [{ from: red, into: black }])
    expect(out.palette).toEqual(palette)
    expect(Array.from(out.map.labels)).toEqual([0, 1, 2, 1, NO_LABEL])
  })

  it('follows chains: green into grey into black ends as black', () => {
    const out = applyMerges(map(), palette, [
      { from: green, into: grey },
      { from: grey, into: black },
    ])
    expect(out.palette).toEqual([black])
    expect(Array.from(out.map.labels)).toEqual([0, 0, 0, 0, NO_LABEL])
  })

  it('skips a merge that would form a loop', () => {
    const out = applyMerges(map(), palette, [
      { from: grey, into: black },
      { from: black, into: grey },
    ])
    expect(out.palette).toEqual([green, black])
  })

  it('ignores a merge of a colour into itself', () => {
    expect(applyMerges(map(), palette, [{ from: grey, into: grey }]).palette).toEqual(palette)
  })

  it('does not change its inputs', () => {
    const m = map()
    const before = Uint8Array.from(m.labels)
    const p = [...palette]
    applyMerges(m, p, [{ from: grey, into: black }])
    expect(m.labels).toEqual(before)
    expect(p).toEqual(palette)
  })
})
