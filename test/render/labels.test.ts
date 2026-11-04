import { describe, expect, it } from 'vitest'
import { type PlacedLabel, placeLabels } from '../../src/render/projector/labels'

const overlap = (a: PlacedLabel['box'], b: PlacedLabel['box']) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('placeLabels', () => {
  it('puts a number inside an area with room for it, without a pointer', () => {
    const [label] = placeLabels([{ id: 0, text: '3', at: { x: 100, y: 100 }, roomMm: 40 }], 20)
    expect(label.centre).toEqual({ x: 100, y: 100 })
    expect(label.pointer).toBeNull()
  })

  it('puts the number of a 5 mm area outside, with a pointer to the area', () => {
    const [label] = placeLabels([{ id: 0, text: '7', at: { x: 100, y: 100 }, roomMm: 2.5 }], 20)
    expect(label.pointer).not.toBeNull()
    expect(label.pointer!.from).toEqual({ x: 100, y: 100 })
    expect(Math.hypot(label.centre.x - 100, label.centre.y - 100)).toBeGreaterThan(10)
  })

  it('never lets two numbers overlap, even in a crowd of tiny areas', () => {
    const crowd = []
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        crowd.push({
          id: i * 6 + j,
          text: String((i * 6 + j) % 12),
          at: { x: 200 + i * 6, y: 200 + j * 6 },
          roomMm: 2,
        })
      }
    }
    crowd.push({ id: 99, text: '1', at: { x: 215, y: 215 }, roomMm: 30 }) // one big area among them
    const placed = placeLabels(crowd, 10)
    expect(placed).toHaveLength(crowd.length)
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++)
        expect(overlap(placed[a].box, placed[b].box)).toBe(false)
    }
  })

  it('moves an inside number outside when a bigger area’s number is already there', () => {
    const placed = placeLabels(
      [
        { id: 0, text: '1', at: { x: 100, y: 100 }, roomMm: 50 },
        { id: 1, text: '2', at: { x: 104, y: 100 }, roomMm: 12 },
      ],
      10,
    )
    const second = placed.find((l) => l.id === 1)!
    expect(second.pointer).not.toBeNull()
    expect(overlap(placed[0].box, placed[1].box)).toBe(false)
  })

  it('sizes the box to the text: two digits are wider than one', () => {
    const [one, two] = placeLabels(
      [
        { id: 0, text: '3', at: { x: 0, y: 0 }, roomMm: 50 },
        { id: 1, text: '13', at: { x: 500, y: 0 }, roomMm: 50 },
      ],
      10,
    )
    expect(two.box.w).toBeGreaterThan(one.box.w)
    expect(one.box.h).toBe(10)
  })

  it('places the biggest areas first, so they keep their spot', () => {
    const placed = placeLabels(
      [
        { id: 0, text: '2', at: { x: 104, y: 100 }, roomMm: 12 },
        { id: 1, text: '1', at: { x: 100, y: 100 }, roomMm: 50 },
      ],
      10,
    )
    expect(placed.find((l) => l.id === 1)!.pointer).toBeNull()
    expect(placed.find((l) => l.id === 0)!.pointer).not.toBeNull()
  })
})
