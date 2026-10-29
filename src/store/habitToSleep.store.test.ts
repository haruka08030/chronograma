import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from './taskStore'
import { instantFromWall, appTimeZone } from '../lib/timeZone'
import { sleepEndingOn } from '../lib/sleep'

/** 習慣「sleep」を睡眠に移す（#653） */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // 2026-10-28 は水曜
  vi.setSystemTime(instantFromWall('2026-10-28', '12:00', appTimeZone()))
  useTaskStore.setState({ habits: [], tasks: [] })
  useTaskStore.setState((s) => ({ addons: { ...s.addons, sleepSchedule: undefined } }))
})
afterEach(() => vi.useRealTimers())

const addSleepHabit = () =>
  useTaskStore.getState().addHabit({
    title: 'sleep',
    color: '#3F51B5',
    timeMode: 'range',
    startTime: '00:00',
    endTime: '08:00',
    frequency: { type: 'daily' },
    weekdayTimes: { 6: { startTime: '01:00', endTime: '10:00' } },
    goalMinutes: undefined,
  })

describe('moveHabitToSleep', () => {
  it('習慣の時間を睡眠の予定（起きる日の曜日）に、習慣の記録を睡眠に直し、習慣はアーカイブ。⌘Z 1 回で戻る', () => {
    const id = addSleepHabit()
    // 習慣の ✓ でできた記録（10/27 の朝）
    useTaskStore.getState().toggleHabitDate(id, '2026-10-27')
    expect(useTaskStore.getState().tasks.map((t) => t.kind)).toEqual(['log'])

    useTaskStore.getState().moveHabitToSleep(id)
    const s = useTaskStore.getState()
    expect(s.addons.sleepSchedule?.[1]).toEqual({ bed: '00:00', wake: '08:00' })
    // 土曜の枠（1:00–10:00）は日をまたがないので土曜の朝
    expect(s.addons.sleepSchedule?.[6]).toEqual({ bed: '01:00', wake: '10:00' })
    expect(sleepEndingOn(s.tasks, '2026-10-27')?.startTime).toBe('00:00')
    expect(s.habits.find((h) => h.id === id)?.archivedAt).toBeTruthy()

    useTaskStore.getState().undoLastOperation()
    const u = useTaskStore.getState()
    expect(u.tasks.map((t) => t.kind)).toEqual(['log'])
    expect(u.habits.find((h) => h.id === id)?.archivedAt).toBeFalsy()
    expect(u.addons.sleepSchedule).toBeUndefined()
  })

  it('もう睡眠のある夜と重なる記録はゴミ箱、題名が sleep のふつうの記録も睡眠に。前からある睡眠の予定の曜日はそのまま', () => {
    const id = addSleepHabit()
    useTaskStore.getState().setSleepSchedule({ 1: { bed: '23:30', wake: '07:00' } })
    useTaskStore.getState().logSleep('2026-10-27', '23:30', '07:30')
    useTaskStore.getState().addTimeLog('昼寝の練習', '2026-10-26', '00:00', '08:00', [])
    // 10/27 の朝と重なる記録（習慣の名前でない記録は、題名が sleep のものだけ）
    useTaskStore.setState((s) => ({
      tasks: s.tasks.map((t) => (t.title === '昼寝の練習' ? { ...t, title: 'sleep', dueDate: '2026-10-27' } : t)),
    }))
    useTaskStore.getState().moveHabitToSleep(id)
    const s = useTaskStore.getState()
    expect(s.tasks.find((t) => t.title === 'sleep')?.deletedAt).toBeTruthy()
    expect(s.addons.sleepSchedule?.[1]).toEqual({ bed: '23:30', wake: '07:00' })
  })
})
