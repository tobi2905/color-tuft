import { describe, expect, it } from 'vitest'
import { findCorners } from '../../../src/core/trace/corners'
import { FIXTURE, circle, triforce } from '../../fixtures/images'
import { loopsOf, staircase, twoColourMap } from './helpers'

const OPTS = { cornerAngleDeg: 60 }

describe('findCorners', () => {
  it('finds the 4 corners of a square', () => {
    const labels = new Uint8Array(40 * 40)
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) labels[y * 40 + x] = 1
    const [loop] = loopsOf({ width: 40, height: 40, mmPerPx: 1, labels })
    const corners = findCorners(loop, OPTS).map((i) => `${loop[i].x},${loop[i].y}`)
    expect(corners.sort()).toEqual(['10,10', '10,30', '30,10', '30,30'])
  })

  it('finds the 3 tips of each Triforce triangle', () => {
    const loops = loopsOf(twoColourMap(triforce(300), FIXTURE.gold))
    expect(loops).toHaveLength(3)
    for (const loop of loops) expect(findCorners(loop, OPTS)).toHaveLength(3)
  })

  it('finds no corners on a circle', () => {
    const [loop] = loopsOf(twoColourMap(circle(250), FIXTURE.red))
    expect(findCorners(loop, OPTS)).toEqual([])
  })

  it.each([
    ['45°', 'RD'],
    ['shallow 1:3', 'RRRD'],
    ['steep 4:1', 'DDDDR'],
    ['irregular 2:3', 'RDRDD'],
  ])('finds no corners on a %s pixel staircase', (_, pattern) => {
    expect(findCorners(staircase(pattern, 20), OPTS)).toEqual([])
  })

  it('finds a corner where two straight staircases meet at 90°', () => {
    const down = staircase('RD', 20)
    const end = down[down.length - 1]
    const up: typeof down = []
    let { x, y } = end
    for (let i = 0; i < 20; i++) {
      x++
      up.push({ x, y })
      y--
      up.push({ x, y })
    }
    const corners = findCorners([...down, ...up], OPTS)
    expect(corners).toHaveLength(1)
    expect(Math.abs(corners[0] - (down.length - 1))).toBeLessThanOrEqual(2)
  })
})
