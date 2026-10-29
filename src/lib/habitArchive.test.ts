import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Habit } from '../types/habit'

beforeAll(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  })
})
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))

const { useTaskStore } = await import('../store/taskStore')
const { isHabitScheduledOnDate } = await import('./habitSchedule')
const { habitToPlannedItem } = await import('./habitSlots')
const { habitRecentRate } = await import('./habitStats')
const { getReview } = await import('./weekReview')
const { fromDateKey } = await import('./dateKey')

const OLD = '2026-01-01T00:00:00.000Z'
const DAY = '2026-10-01'

function habit(id: string, patch: Partial<Habit> = {}): Habit {
  return {
    id,
    title: id,
    color: '#33B679',
    timeMode: 'range',
    startTime: '07:00',
    endTime: '08:00',
    frequency: { type: 'daily' },
    createdAt: OLD,
    updatedAt: OLD,
    completedDates: [DAY],
    archivedAt: null,
    ...patch,
  }
}

describe('アーカイブした習慣', () => {
  it('やめた日から先の予定に入らず、前の日は入る（今日の計画・タイムライン）', () => {
    const archived = habit('a', { archivedAt: OLD, endedOn: DAY })
    expect(isHabitScheduledOnDate(habit('h'), fromDateKey(DAY))).toBe(true)
    expect(isHabitScheduledOnDate(archived, fromDateKey(DAY))).toBe(false)
    expect(isHabitScheduledOnDate(archived, fromDateKey('2026-10-02'))).toBe(false)
    expect(isHabitScheduledOnDate(archived, fromDateKey('2026-09-30'))).toBe(true)
    expect(habitToPlannedItem(habit('h'), DAY)).not.toBeNull()
    expect(habitToPlannedItem(archived, DAY)).toBeNull()
    expect(habitToPlannedItem(archived, '2026-09-30')).not.toBeNull()
  })

  it('やめた日の無い古いデータはどの日にも入らない。戻した習慣はやめた日を見ない', () => {
    expect(isHabitScheduledOnDate(habit('a', { archivedAt: OLD }), fromDateKey('2026-09-30'))).toBe(false)
    expect(isHabitScheduledOnDate(habit('a', { endedOn: '2026-09-01' }), fromDateKey(DAY))).toBe(true)
  })

  it('ゴミ箱の習慣もやめた日より前は入る', () => {
    const trashed = habit('t', { deletedAt: OLD, endedOn: DAY })
    expect(isHabitScheduledOnDate(trashed, fromDateKey('2026-09-30'))).toBe(true)
    expect(isHabitScheduledOnDate(trashed, fromDateKey(DAY))).toBe(false)
  })

  it('時刻ひとつの習慣も、✓ で作る記録と同じ枠でタイムラインに出す', () => {
    const fixed = habit('gym', { timeMode: 'fixed', startTime: '09:30', endTime: null })
    expect(habitToPlannedItem(fixed, DAY)).toMatchObject({ startTime: '09:30', endTime: '09:45' })
    expect(habitToPlannedItem(habit('n', { timeMode: 'none', startTime: null, endTime: null }), DAY)).toBeNull()
  })

  it('項目の無い古い習慣は使用中として扱う', () => {
    const legacy = { ...habit('h'), archivedAt: undefined } as unknown as Habit
    expect(isHabitScheduledOnDate(legacy, fromDateKey(DAY))).toBe(true)
  })

  it('やめた日から先は達成率・週のふりかえりに数えず、前の日は数える', () => {
    const untimed = { timeMode: 'none' as const, startTime: null, endTime: null }
    const live = habit('h', { completedDates: [] })
    expect(habitRecentRate(habit('a', { ...untimed, archivedAt: OLD }))).toBeNull()
    const at = (endedOn: string) =>
      getReview(
        [],
        [live, habit('a', { ...untimed, archivedAt: OLD, endedOn })],
        'week',
        fromDateKey(DAY),
        new Set(),
        new Date(`${DAY}T23:00:00`),
      ).habitRate
    // 10/1 は木曜。週は 9/28〜。9/28〜9/30 は live も a も未達成、10/1 は a だけ達成
    expect(at('2026-09-28')).toBe(0)
    expect(at('2026-10-02')).toBeGreaterThan(0)
  })

  it('週に◯回の習慣は、やめた日から先の日を週の回数に入れない', () => {
    const weekly = habit('w', {
      timeMode: 'none',
      startTime: null,
      endTime: null,
      frequency: { type: 'timesPerWeek', count: 3 },
      completedDates: [],
    })
    const now = new Date('2026-10-04T23:00:00')
    const rate = (patch: Partial<Habit>) => getReview([], [{ ...weekly, ...patch }], 'week', fromDateKey(DAY), new Set(), now).habitRate
    expect(rate({})).toBe(0)
    // 日曜にやめた: 月〜土の 6 日で 3 回を求める
    expect(rate({ archivedAt: OLD, endedOn: '2026-10-04', completedDates: ['2026-09-28', '2026-09-29', '2026-09-30'] })).toBe(1)
    // 週のはじめにやめた: 求める回数が無い
    expect(rate({ archivedAt: OLD, endedOn: '2026-09-28' })).toBeNull()
  })
})

describe('archiveHabit / restoreHabit', () => {
  it('アーカイブしても達成日は残り、戻すと使用中に戻る。取り消しのトーストが出る', () => {
    useTaskStore.setState({ habits: [habit('h')], undoBanner: null })
    useTaskStore.getState().archiveHabit('h')
    const archived = useTaskStore.getState().habits[0]
    expect(archived.archivedAt).not.toBeNull()
    expect(archived.completedDates).toEqual([DAY])
    expect(archived.updatedAt).not.toBe(OLD)
    expect(useTaskStore.getState().undoBanner?.text).toMatchObject({ key: 'undo.habitArchived', params: { name: 'h' } })

    useTaskStore.getState().restoreHabit('h')
    expect(useTaskStore.getState().habits[0]).toMatchObject({ archivedAt: null, completedDates: [DAY] })
  })

  it('アーカイブ・ゴミ箱へ入れた日をやめた日にし、両方から戻したら外す', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-05T12:00:00'))
    try {
      useTaskStore.setState({ habits: [habit('h')] })
      useTaskStore.getState().archiveHabit('h')
      expect(useTaskStore.getState().habits[0].endedOn).toBe('2026-10-05')
      vi.setSystemTime(new Date('2026-10-07T12:00:00'))
      // あとでゴミ箱へ入れても、先にやめた日のまま
      useTaskStore.getState().deleteHabit('h')
      expect(useTaskStore.getState().habits[0].endedOn).toBe('2026-10-05')
      useTaskStore.getState().restoreDeletedHabits(['h'])
      expect(useTaskStore.getState().habits[0].endedOn).toBe('2026-10-05')
      useTaskStore.getState().restoreHabit('h')
      expect(useTaskStore.getState().habits[0]).not.toHaveProperty('endedOn')
    } finally {
      vi.useRealTimers()
    }
  })

  it('新しく作った習慣は使用中', () => {
    useTaskStore.setState({ habits: [] })
    useTaskStore
      .getState()
      .addHabit({ title: 'n', color: '#33B679', timeMode: 'none', startTime: null, endTime: null, frequency: { type: 'daily' } })
    expect(useTaskStore.getState().habits[0].archivedAt).toBeNull()
  })
})
