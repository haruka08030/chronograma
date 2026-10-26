import { describe, expect, it } from 'vitest'
import { DEFAULT_SLEEP_PREFS, normalizeSleepPrefs } from './sleepPrefs'

describe('normalizeSleepPrefs', () => {
  it('壊れた値は既定、いつもの時刻は 2 つそろったときだけ、目標は 3〜12 時間', () => {
    expect(normalizeSleepPrefs(null)).toEqual(DEFAULT_SLEEP_PREFS)
    expect(normalizeSleepPrefs({ usualBed: '23:30', usualWake: '07:00', goalMinutes: 450 })).toEqual({
      usualBed: '23:30',
      usualWake: '07:00',
      goalMinutes: 450,
    })
    expect(normalizeSleepPrefs({ usualBed: '23:30', usualWake: null, goalMinutes: 60 })).toEqual(DEFAULT_SLEEP_PREFS)
    expect(normalizeSleepPrefs({ usualBed: '25:00', usualWake: '07:00' }).usualBed).toBeNull()
  })
})
