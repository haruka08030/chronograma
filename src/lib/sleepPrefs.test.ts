import { describe, expect, it } from 'vitest'
import { DEFAULT_SLEEP_PREFS, normalizeSleepPrefs } from './sleepPrefs'

describe('normalizeSleepPrefs', () => {
  it('壊れた値は既定、目標は 3〜12 時間', () => {
    expect(normalizeSleepPrefs(null)).toEqual(DEFAULT_SLEEP_PREFS)
    expect(normalizeSleepPrefs({ goalMinutes: 450 })).toEqual({ goalMinutes: 450 })
    expect(normalizeSleepPrefs({ goalMinutes: 60 })).toEqual(DEFAULT_SLEEP_PREFS)
  })
})
