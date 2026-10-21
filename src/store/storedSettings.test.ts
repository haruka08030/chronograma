import { describe, expect, it } from 'vitest'
import { DATA_KEYS } from './persistKeys'
import { ROW_KEYS, SETTING_STAMPS, STORED_SETTINGS, normalizeStoredState } from './storedSettings'
import { DEFAULT_TIMETABLE } from '../lib/timetable'
import { DEFAULT_ADDONS } from '../lib/addons'

describe('保存する設定の表（storedSettings）', () => {
  it('行以外の保存する値はどれも表に入っている（設定を足したら表に 1 行足す）', () => {
    const settings = (DATA_KEYS as readonly string[]).filter((k) => !(ROW_KEYS as readonly string[]).includes(k)).sort()
    expect(Object.keys(STORED_SETTINGS).sort()).toEqual(settings)
  })

  it('変えた時刻はどれも保存する値で、時刻どうしは別の設定を見ない', () => {
    for (const [stamp, keys] of Object.entries(SETTING_STAMPS)) {
      expect(DATA_KEYS).toContain(stamp)
      expect(keys.length).toBeGreaterThan(0)
    }
    expect(SETTING_STAMPS.logLabelsUpdatedAt).toEqual(['timeLogTagPresets', 'logCategoryColors', 'logLabelTargets', 'logLabelIds'])
  })

  it('あるキーだけそろえ、型の違う設定は既定値・直した値に、配列でない一覧は外して broken', () => {
    const state: Record<string, unknown> = { timetable: 'x', addons: null, tasks: 'oops' }
    expect(normalizeStoredState(state)).toEqual({ broken: true })
    expect(state.timetable).toEqual(DEFAULT_TIMETABLE)
    expect(state.addons).toEqual(DEFAULT_ADDONS)
    expect('tasks' in state).toBe(false)
    expect('extraTimeZones' in state).toBe(false)
  })
})
