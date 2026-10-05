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
const { completionRatioOnDate } = await import('./habitStats')
const { getWeekReview } = await import('./weekReview')
const { fromDateKey } = await import('./dateKey')

const OLD = '2026-01-01T00:00:00.000Z'
const DAY = '2026-10-01'

function habit(id: string, patch: Partial<Habit> = {}): Habit {
  return {
    id, title: id, color: '#33B679', timeMode: 'range', startTime: '07:00', endTime: '08:00',
    frequency: { type: 'daily' }, createdAt: OLD, updatedAt: OLD, completedDates: [DAY], archivedAt: null,
    ...patch,
  }
}

describe('アーカイブした習慣', () => {
  it('どの日の予定にも入らない（今日の計画・タイムライン）', () => {
    const archived = habit('a', { archivedAt: OLD })
    expect(isHabitScheduledOnDate(habit('h'), fromDateKey(DAY))).toBe(true)
    expect(isHabitScheduledOnDate(archived, fromDateKey(DAY))).toBe(false)
    expect(habitToPlannedItem(habit('h'), DAY)).not.toBeNull()
    expect(habitToPlannedItem(archived, DAY)).toBeNull()
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

  it('達成率・週のふりかえりに数えない', () => {
    const habits = [habit('h', { completedDates: [] }), habit('a', { timeMode: 'none', startTime: null, endTime: null, archivedAt: OLD })]
    expect(completionRatioOnDate(habits, fromDateKey(DAY))).toBe(0)
    const review = getWeekReview([], habits, fromDateKey(DAY), new Set(), new Date(`${DAY}T23:00:00`))
    expect(review.habitRate).toBe(0)
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

  it('新しく作った習慣は使用中', () => {
    useTaskStore.setState({ habits: [] })
    useTaskStore.getState().addHabit({ title: 'n', color: '#33B679', timeMode: 'none', startTime: null, endTime: null, frequency: { type: 'daily' } })
    expect(useTaskStore.getState().habits[0].archivedAt).toBeNull()
  })
})
