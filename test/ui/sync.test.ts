import { describe, expect, it } from 'vitest'
import type { PipelineResult } from '../../src/core/pipeline'
import { type ProjectorState, applyMessage, projectorStateFrom } from '../../src/ui/projector/sync'
import { createProjectStore } from '../../src/ui/store/projectStore'

const store = createProjectStore()
const full: ProjectorState = projectorStateFrom(store.getState())

describe('applyMessage', () => {
  it('applies a state update, keeping what it does not mention', () => {
    const next = applyMessage(full, {
      type: 'state',
      state: { projector: { ...full.projector, focus: 2 } },
    })!
    expect(next.projector.focus).toBe(2)
    expect(next.rug).toEqual(full.rug)
  })

  it('takes a full state when it has none yet', () => {
    expect(applyMessage(null, { type: 'state', state: full })).toEqual(full)
  })

  it('ignores messages of unknown type, requests and anything malformed', () => {
    expect(applyMessage(full, { type: 'dance' })).toBe(full)
    expect(applyMessage(full, { type: 'request' })).toBe(full)
    expect(applyMessage(full, 'hello')).toBe(full)
    expect(applyMessage(full, null)).toBe(full)
    expect(applyMessage(full, { type: 'state' })).toBe(full)
  })

  it('does not start from a partial update (it waits for the full state)', () => {
    expect(applyMessage(null, { type: 'state', state: { projector: full.projector } })).toBeNull()
  })
})

describe('projectorStateFrom', () => {
  it('takes what the projector draws from the project', () => {
    const s = createProjectStore()
    s.getState().setFocus(1)
    s.getState().setResult({
      palette: [],
      suggestedCount: 2,
      pattern: { rug: { widthMm: 300, heightMm: 200 }, edges: [], regions: [] },
      cut: null,
      roles: { border: null, background: null },
      rolesAdded: { border: false, background: false },
    } as unknown as PipelineResult)
    const p = projectorStateFrom(s.getState())
    expect(p.rug).toEqual({ widthMm: 300, heightMm: 200 })
    expect(p.pattern?.rug).toEqual({ widthMm: 300, heightMm: 200 })
    expect(p.projector.focus).toBe(1)
    expect(p.cut).toBeNull()
  })

  it('works before there is a pattern', () => {
    const p = projectorStateFrom(createProjectStore().getState())
    expect(p.pattern).toBeNull()
    expect(p.rug).toEqual({ widthMm: 1000, heightMm: 1000 })
  })
})
