import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// ストアを node で読み込むための最小限の localStorage
beforeAll(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  })
  vi.useFakeTimers({ toFake: ['Date'] })
  // アプリの今日は 2026-10-03
  vi.setSystemTime(new Date('2026-10-03T12:00:00'))
})
afterAll(() => {
  vi.useRealTimers()
})
vi.mock('../i18n/config', () => ({
  default: { t: (k: string, o?: { returnObjects?: boolean }) => (o?.returnObjects ? [] : k), language: 'ja' },
}))

const { useTaskStore } = await import('./taskStore')

const st = () => useTaskStore.getState()
const get = (id: string) => st().tasks.find((t) => t.id === id)!
const idOf = (title: string) => st().tasks.find((t) => t.title === title)!.id

beforeEach(() => {
  st().resetLocalData()
})

describe('予定日を移したときの控え（#158）', () => {
  it('今日の予定を明日へ（時間ブロックのまま・日だけ移す）と元の予定が残り、⌘Z で消える', () => {
    st().addTaskWithTime('レポート', '2026-10-03', '13:00', '14:00')
    const id = idOf('レポート')
    st().updateTask(id, { scheduledDate: '2026-10-04' })
    expect(get(id).movedPlans).toEqual([{ date: '2026-10-03', startTime: '13:00', endTime: '14:00', to: '2026-10-04' }])
    st().undoLastOperation()
    expect(get(id).scheduledDate).toBe('2026-10-03')
    expect('movedPlans' in get(id)).toBe(false)
  })

  it('まとめて日を変える（持ち越し）でも残る。先の日どうしの付け替えは残さない', () => {
    st().addTaskWithTime('A', '2026-10-02', '09:00', '10:00')
    st().addTaskWithDate('B', '2026-10-06')
    const a = idOf('A')
    const b = idOf('B')
    st().rescheduleTasks([a, b], '2026-10-07')
    expect(get(a).movedPlans).toEqual([{ date: '2026-10-02', startTime: '09:00', endTime: '10:00', to: '2026-10-07' }])
    expect('movedPlans' in get(b)).toBe(false)
  })

  it('繰り返しの次の回には控えを写さない', () => {
    st().addTaskWithDate('週報', '2026-10-03')
    const id = idOf('週報')
    st().updateTask(id, { dueDate: '2026-10-03', recurrence: { type: 'weekly', interval: 1 } })
    st().updateTask(id, { scheduledDate: '2026-10-04' })
    st().toggleTask(id)
    const next = st().tasks.find((t) => t.id !== id && t.title === '週報')!
    expect(get(id).movedPlans).toHaveLength(1)
    expect('movedPlans' in next).toBe(false)
  })
})
