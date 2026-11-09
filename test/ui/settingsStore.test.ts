import { describe, expect, it } from 'vitest'
import { createSettingsStore } from '../../src/ui/store/settingsStore'

describe('settings store', () => {
  it('keeps yarn photos by default', () => {
    expect(createSettingsStore().getState().keepYarnPhotos).toBe(true)
  })

  it('turns keeping yarn photos off and on', () => {
    const store = createSettingsStore()
    store.getState().setKeepYarnPhotos(false)
    expect(store.getState().keepYarnPhotos).toBe(false)
    store.getState().setKeepYarnPhotos(true)
    expect(store.getState().keepYarnPhotos).toBe(true)
  })
})
