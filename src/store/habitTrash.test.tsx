import { describe, expect, it } from 'vitest'
import { selectLiveHabits, useTaskStore } from './taskStore'
import { TRASH_KEEP_DAYS } from './storeConstants'
import type { Habit } from '../types/habit'
import { normalizeHabitRow } from '../lib/backupFormat'

const DAY = 24 * 60 * 60_000
const NOW = Date.parse('2026-11-01T00:00:00.000Z')
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()
const OLD = '2026-01-01T00:00:00.000Z'

function habit(id: string, patch: Partial<Habit> = {}): Habit {
  return {
    id,
    title: id,
    color: '#33B679',
    timeMode: 'none',
    startTime: null,
    endTime: null,
    frequency: { type: 'daily' },
    createdAt: OLD,
    updatedAt: OLD,
    completedDates: ['2026-10-01', '2026-10-02'],
    archivedAt: null,
    ...patch,
  }
}
const get = (id: string) => useTaskStore.getState().habits.find((h) => h.id === id)
const tick = () => new Promise((r) => queueMicrotask(() => r(null)))

describe('習慣の削除はゴミ箱へ（#489）', () => {
  it('消すとゴミ箱に入り、画面に出す習慣からは外れる。戻すと達成日ごと戻る', async () => {
    useTaskStore.setState({ habits: [habit('gym'), habit('read')] })
    useTaskStore.getState().deleteHabit('gym')
    await tick()
    expect(get('gym')?.deletedAt).toBeTruthy()
    expect(get('gym')!.updatedAt > OLD).toBe(true)
    expect(selectLiveHabits(useTaskStore.getState()).map((h) => h.id)).toEqual(['read'])
    expect(useTaskStore.getState().undoBanner?.text).toEqual({ key: 'undo.habitDeleted', params: { name: 'gym' } })

    useTaskStore.getState().restoreDeletedHabits(['gym'])
    expect(get('gym')).not.toHaveProperty('deletedAt')
    expect(get('gym')!.completedDates).toEqual(['2026-10-01', '2026-10-02'])
    expect(selectLiveHabits(useTaskStore.getState()).map((h) => h.id)).toEqual(['gym', 'read'])
  })

  it('トーストの「元に戻す」でも戻る', async () => {
    useTaskStore.setState({ habits: [habit('gym')] })
    useTaskStore.getState().deleteHabit('gym')
    await tick()
    useTaskStore.getState().undoOperation(useTaskStore.getState().undoBanner!.undoId!)
    expect(get('gym')?.deletedAt).toBeUndefined()
  })

  it('同じ habits には同じ配列を返す（描き直しを増やさない）', () => {
    useTaskStore.setState({ habits: [habit('a'), habit('b', { deletedAt: OLD })] })
    const s = useTaskStore.getState()
    expect(selectLiveHabits(s)).toBe(selectLiveHabits(s))
  })

  it('完全に削除・ゴミ箱を空にする・30 日たったら消す', () => {
    useTaskStore.setState({
      tasks: [],
      habits: [habit('live'), habit('old', { deletedAt: ago(TRASH_KEEP_DAYS + 1) }), habit('recent', { deletedAt: ago(1) })],
    })
    expect(useTaskStore.getState().purgeExpiredDeleted(NOW)).toBe(1)
    expect(useTaskStore.getState().habits.map((h) => h.id)).toEqual(['live', 'recent'])

    useTaskStore.getState().permanentlyDeleteHabits(['live'])
    // ゴミ箱に無い習慣は完全に削除しない
    expect(get('live')).toBeDefined()
    useTaskStore.getState().emptyDeleted()
    expect(useTaskStore.getState().habits.map((h) => h.id)).toEqual(['live'])
  })

  it('バックアップの読み込みでゴミ箱の時刻を残す', () => {
    expect(normalizeHabitRow({ ...habit('a'), deletedAt: OLD })?.deletedAt).toBe(OLD)
    expect(normalizeHabitRow(habit('a'))).not.toHaveProperty('deletedAt')
  })
})
