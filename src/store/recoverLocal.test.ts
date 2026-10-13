import { describe, expect, it } from 'vitest'
import { mergeRecoveredState } from './recoverLocal'

const defaults = {
  tasks: [],
  lists: [{ id: 'inbox' }],
  dataOwner: null,
  theme: 'system',
  weekStartsOn: 1,
  dayMoods: {},
  logCategoryColors: { 授業: '#1' },
  timeLogTagPresets: ['授業'],
  logLabelsUpdatedAt: null,
  eventTemplates: [],
  eventTemplatesUpdatedAt: null,
  activeTimer: null,
  activeTimerUpdatedAt: null,
}

describe('移した後に localStorage で動いた回の本体を合わせる（mergeRecoveredState）', () => {
  it('行は id ごとに両方を残し、同じ id はその回のほう', () => {
    const { state } = mergeRecoveredState(
      {
        ...defaults,
        tasks: [
          { id: 'a', t: 1 },
          { id: 'b', t: 1 },
        ],
      },
      {
        ...defaults,
        tasks: [
          { id: 'b', t: 2 },
          { id: 'c', t: 2 },
        ],
      },
      defaults,
    )
    expect(state.tasks).toEqual([
      { id: 'a', t: 1 },
      { id: 'b', t: 2 },
      { id: 'c', t: 2 },
    ])
    expect(state.lists).toEqual([{ id: 'inbox' }])
  })

  it('行以外は IndexedDB の側のまま。その回で既定値から変えたものだけを入れる', () => {
    const { state } = mergeRecoveredState(
      { ...defaults, theme: 'dark', weekStartsOn: 0, dayMoods: { '2026-10-01': { mood: 4 } } },
      { ...defaults, weekStartsOn: 6, dayMoods: { '2026-10-02': { mood: 2 } } },
      defaults,
    )
    expect(state.theme).toBe('dark')
    expect(state.weekStartsOn).toBe(6)
    expect(state.dayMoods).toEqual({ '2026-10-01': { mood: 4 }, '2026-10-02': { mood: 2 } })
  })

  it('変えた時刻を持つものは、その回の時刻が新しいときだけ。動いているタイマーは IndexedDB の側', () => {
    const stored = {
      ...defaults,
      eventTemplates: [{ id: 't1' }],
      eventTemplatesUpdatedAt: '2026-10-01T00:00:00Z',
      timeLogTagPresets: ['授業', 'ゼミ'],
      logLabelsUpdatedAt: '2026-10-05T00:00:00Z',
      activeTimer: { startedAt: 'x' },
      activeTimerUpdatedAt: '2026-10-01T00:00:00Z',
    }
    const local = {
      ...defaults,
      eventTemplates: [{ id: 't2' }],
      eventTemplatesUpdatedAt: '2026-10-03T00:00:00Z',
      timeLogTagPresets: ['授業', 'バイト'],
      logLabelsUpdatedAt: '2026-10-02T00:00:00Z',
      activeTimer: { startedAt: 'y' },
      activeTimerUpdatedAt: '2026-10-09T00:00:00Z',
    }
    const { state } = mergeRecoveredState(stored, local, defaults)
    expect(state.eventTemplates).toEqual([{ id: 't2' }])
    expect(state.eventTemplatesUpdatedAt).toBe('2026-10-03T00:00:00Z')
    expect(state.timeLogTagPresets).toEqual(['授業', 'ゼミ'])
    expect(state.activeTimer).toEqual({ startedAt: 'x' })
  })

  it('持ち主が片方だけなら null。別の人どうしは合わせずにその回のほう', () => {
    expect(mergeRecoveredState({ ...defaults, dataOwner: 'u1' }, { ...defaults }, defaults).state.dataOwner).toBeNull()
    expect(mergeRecoveredState({ ...defaults, dataOwner: 'u1' }, { ...defaults, dataOwner: 'u1' }, defaults).state.dataOwner).toBe('u1')
    const other = mergeRecoveredState(
      { ...defaults, dataOwner: 'u1', tasks: [{ id: 'a' }] },
      { ...defaults, dataOwner: 'u2', tasks: [{ id: 'b' }] },
      defaults,
    )
    expect(other.replaced).toBe(true)
    expect(other.state.tasks).toEqual([{ id: 'b' }])
  })
})
