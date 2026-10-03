import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { nextDueDate, recurrenceNextId, toggleTaskCompletion } from './taskRecurrence'
import { TASK_DEFAULTS } from '../lib/taskDefaults'

// localStorage・i18n を用意しなくても読める（ストアを通さない）

const T0 = '2026-10-02T09:00:00.000Z'
const T1 = '2026-10-02T09:05:00.000Z'

function task(fields: Partial<Task> = {}): Task {
  return {
    ...TASK_DEFAULTS,
    id: 'gym', title: 'ジム', description: '', completed: false, completedAt: null, createdAt: T0, updatedAt: T0,
    order: 0, listId: '__inbox__', sectionId: null, parentId: null, dueDate: '2026-10-02', startTime: null, endTime: null,
    priority: 'none', tags: [], recurrence: { type: 'weekly', interval: 1 },
    ...fields,
  }
}
const ids = (tasks: Task[] | null) => (tasks ?? []).map((t) => t.id).sort()

describe('nextDueDate', () => {
  it('間隔ぶん先の日付（月末は date-fns と同じく丸める）', () => {
    expect(nextDueDate('2026-10-02', { type: 'daily', interval: 3 })).toBe('2026-10-05')
    expect(nextDueDate('2026-10-02', { type: 'weekly', interval: 2 })).toBe('2026-10-16')
    expect(nextDueDate('2026-01-31', { type: 'monthly', interval: 1 })).toBe('2026-02-28')
    expect(nextDueDate('2028-02-29', { type: 'yearly', interval: 1 })).toBe('2029-02-28')
  })

  it('曜日つきの毎週は、選んだ曜日のうち次に来る日', () => {
    // 2026-10-05 は月曜
    const monWedFri = { type: 'weekly' as const, interval: 1, weekdays: [1, 3, 5] }
    expect(nextDueDate('2026-10-05', monWedFri)).toBe('2026-10-07')
    expect(nextDueDate('2026-10-07', monWedFri)).toBe('2026-10-09')
    expect(nextDueDate('2026-10-09', monWedFri)).toBe('2026-10-12')
    // 選んでいない曜日（締切を動かした）からでも次の選んだ曜日
    expect(nextDueDate('2026-10-06', monWedFri)).toBe('2026-10-07')
    expect(nextDueDate('2026-10-10', monWedFri)).toBe('2026-10-12')
  })

  it('曜日つきで 2 週ごとなら、週の最後の曜日の後は 2 週先の最初の曜日', () => {
    const r = { type: 'weekly' as const, interval: 2, weekdays: [1, 3] }
    expect(nextDueDate('2026-10-05', r)).toBe('2026-10-07')
    expect(nextDueDate('2026-10-07', r)).toBe('2026-10-19')
    // 日曜（7）は週の終わり
    expect(nextDueDate('2026-10-11', { type: 'weekly', interval: 1, weekdays: [6, 7] })).toBe('2026-10-17')
    expect(nextDueDate('2026-10-10', { type: 'weekly', interval: 1, weekdays: [6, 7] })).toBe('2026-10-11')
  })

  it('平日（月〜金）は金曜の次が月曜', () => {
    const weekdays = { type: 'weekly' as const, interval: 1, weekdays: [1, 2, 3, 4, 5] }
    expect(nextDueDate('2026-10-08', weekdays)).toBe('2026-10-09')
    expect(nextDueDate('2026-10-09', weekdays)).toBe('2026-10-12')
  })
})

describe('曜日つきの毎週の次回', () => {
  it('やる日は締切と同じ日数だけずらす', () => {
    const r = { type: 'weekly' as const, interval: 1, weekdays: [1, 3] }
    // 月曜締切・前日の日曜にやる → 水曜締切・火曜にやる
    const next = toggleTaskCompletion(
      [task({ dueDate: '2026-10-05', scheduledDate: '2026-10-04', recurrence: r })], 'gym', T1,
    )!.find((t) => t.id !== 'gym')!
    expect(next).toMatchObject({ id: 'gym@2026-10-07', dueDate: '2026-10-07', scheduledDate: '2026-10-06', recurrence: r })
  })
})

describe('recurrenceNextId', () => {
  it('次回の id は、いちばん元の id に次の期限を付ける', () => {
    expect(recurrenceNextId('gym', '2026-10-09')).toBe('gym@2026-10-09')
    expect(recurrenceNextId('gym@2026-10-09', '2026-10-16')).toBe('gym@2026-10-16')
  })
})

describe('toggleTaskCompletion', () => {
  it('無い id は null', () => {
    expect(toggleTaskCompletion([task()], 'nope', T1)).toBeNull()
  })

  it('完了すると次回を未完了で足す（予定日も同じだけ進める）', () => {
    const out = toggleTaskCompletion([task({ scheduledDate: '2026-10-01' })], 'gym', T1)!
    expect(ids(out)).toEqual(['gym', 'gym@2026-10-09'])
    const done = out.find((t) => t.id === 'gym')!
    expect(done).toMatchObject({ completed: true, completedAt: T1, updatedAt: T1 })
    const next = out.find((t) => t.id === 'gym@2026-10-09')!
    expect(next).toMatchObject({
      completed: false, completedAt: null, dueDate: '2026-10-09', scheduledDate: '2026-10-08', createdAt: T1, updatedAt: T1,
    })
  })

  it('次回が既にあれば増やさない（完了 → 戻す → 完了・2 台で同じ回を完了）', () => {
    const existing = task({ id: 'gym@2026-10-09', dueDate: '2026-10-09', title: '脚の日', createdAt: T0, updatedAt: T1 })
    const out = toggleTaskCompletion([task(), existing], 'gym', T1)!
    expect(ids(out)).toEqual(['gym', 'gym@2026-10-09'])
    expect(out.find((t) => t.id === 'gym@2026-10-09')!.title).toBe('脚の日')
  })

  it('完了を戻すと、手を付けていない次回だけ片付ける', () => {
    const completed = toggleTaskCompletion([task()], 'gym', T1)!
    expect(ids(toggleTaskCompletion(completed, 'gym', T1))).toEqual(['gym'])

    const touched = completed.map((t) => (t.id === 'gym@2026-10-09' ? { ...t, title: 'ジム（脚）', updatedAt: '2026-10-02T10:00:00.000Z' } : t))
    const undone = toggleTaskCompletion(touched, 'gym', T1)!
    expect(ids(undone)).toEqual(['gym', 'gym@2026-10-09'])
    expect(undone.find((t) => t.id === 'gym')).toMatchObject({ completed: false, completedAt: null })
  })

  it('期限の無い繰り返し・繰り返しの無いタスクは次回を作らない', () => {
    expect(ids(toggleTaskCompletion([task({ dueDate: null })], 'gym', T1))).toEqual(['gym'])
    expect(ids(toggleTaskCompletion([task({ recurrence: null })], 'gym', T1))).toEqual(['gym'])
  })

  it('元の配列は書き換えない', () => {
    const before = [task()]
    toggleTaskCompletion(before, 'gym', T1)
    expect(before).toHaveLength(1)
    expect(before[0]!.completed).toBe(false)
  })
})
