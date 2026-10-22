import { describe, expect, it } from 'vitest'
import type { Habit } from '../types/habit'
import type { Task } from '../types/task'
import { baselineFrom, mergeSnapshots, SYNC_INBOX_LIST_ID, type SyncSnapshot } from './syncMerge'
import { TASK_DEFAULTS } from './taskDefaults'

/** 行の中の、別々に足せる小さなもの（習慣の日ごとの時間・To-Do の移した予定）は、2 台で別々に足したものをどちらも残す */
describe('行の中の小さなものの集まり: 日ごとに合わせる', () => {
  const T0 = '2026-09-01T00:00:00.000Z'
  const T1 = '2026-09-02T00:00:00.000Z'
  const T2 = '2026-09-03T00:00:00.000Z'
  const inbox = { id: SYNC_INBOX_LIST_ID, name: '未分類', color: '#888888', order: 0 }
  const snap = (patch: Partial<SyncSnapshot>): SyncSnapshot => ({ lists: [inbox], tasks: [], habits: [], sections: [], ...patch })
  const habit = (patch: Partial<Habit> = {}): Habit => ({
    id: 'h',
    title: '散歩',
    color: '#888888',
    timeMode: 'fixed',
    startTime: '07:00',
    endTime: '07:30',
    frequency: { type: 'daily' },
    createdAt: T0,
    updatedAt: T0,
    completedDates: [],
    archivedAt: null,
    ...patch,
  })
  const todo = (patch: Partial<Task> = {}): Task => ({
    ...TASK_DEFAULTS,
    id: 't',
    title: 'レポート',
    description: '',
    completed: false,
    completedAt: null,
    createdAt: T0,
    updatedAt: T0,
    order: 0,
    listId: SYNC_INBOX_LIST_ID,
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...patch,
  })

  it('2 台で別の日の習慣の時間を動かしても、両方の日が残る', () => {
    const base = habit({ timeOverrides: { '2026-09-01': { startTime: '08:00', endTime: '08:30' } } })
    const baseline = baselineFrom(snap({ habits: [base] }))
    const phone = habit({
      updatedAt: T1,
      timeOverrides: { ...base.timeOverrides, '2026-09-07': { startTime: '09:00', endTime: '09:30' } },
    })
    const pc = habit({
      updatedAt: T2,
      timeOverrides: { ...base.timeOverrides, '2026-09-08': { startTime: '10:00', endTime: '10:30' } },
    })
    const { merged, conflicts } = mergeSnapshots(snap({ habits: [phone] }), snap({ habits: [pc] }), baseline)
    expect(Object.keys(merged.habits[0]!.timeOverrides!).sort()).toEqual(['2026-09-01', '2026-09-07', '2026-09-08'])
    expect(conflicts['habits.timeOverrides']).toBeUndefined()
    // 合わせた結果はどちらとも違うので、送るために時刻を新しくする
    expect(merged.habits[0]!.updatedAt > T2).toBe(true)
  })

  it('片方で戻した日は戻ったまま（控えにあって片方で外した日）', () => {
    const base = habit({ timeOverrides: { '2026-09-01': { startTime: '08:00', endTime: '08:30' } } })
    const baseline = baselineFrom(snap({ habits: [base] }))
    const phone = habit({ updatedAt: T1 })
    const pc = habit({ updatedAt: T2, timeOverrides: { ...base.timeOverrides, '2026-09-08': { startTime: '10:00', endTime: null } } })
    const { merged } = mergeSnapshots(snap({ habits: [phone] }), snap({ habits: [pc] }), baseline)
    expect(merged.habits[0]!.timeOverrides).toEqual({ '2026-09-08': { startTime: '10:00', endTime: null } })
  })

  it('2 台で別々に移した予定の控えをどちらも残す', () => {
    const base = todo({ movedPlans: [{ date: '2026-09-01', startTime: null, endTime: null, to: '2026-09-02' }] })
    const baseline = baselineFrom(snap({ tasks: [base] }))
    const phone = todo({
      updatedAt: T1,
      movedPlans: [...base.movedPlans!, { date: '2026-09-03', startTime: null, endTime: null, to: '2026-09-04' }],
    })
    const pc = todo({
      updatedAt: T2,
      movedPlans: [...base.movedPlans!, { date: '2026-09-05', startTime: '10:00', endTime: '11:00', to: '2026-09-06' }],
    })
    const { merged, conflicts } = mergeSnapshots(snap({ tasks: [phone] }), snap({ tasks: [pc] }), baseline)
    expect(merged.tasks[0]!.movedPlans!.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-05', '2026-09-03'])
    expect(conflicts['tasks.movedPlans']).toBeUndefined()
  })

  it('古い控え（日ごとの時間の控えが無い）なら前の動き（新しいほう）', () => {
    const base = habit({ timeOverrides: { '2026-09-01': { startTime: '08:00', endTime: '08:30' } } })
    const baseline = baselineFrom(snap({ habits: [base] }))
    delete baseline.habitTimeOverrides
    const phone = habit({ updatedAt: T1, timeOverrides: { '2026-09-07': { startTime: '09:00', endTime: '09:30' } } })
    const pc = habit({ updatedAt: T2, timeOverrides: { '2026-09-08': { startTime: '10:00', endTime: '10:30' } } })
    const { merged } = mergeSnapshots(snap({ habits: [phone] }), snap({ habits: [pc] }), baseline)
    expect(merged.habits[0]!.timeOverrides).toEqual(pc.timeOverrides)
  })
})
