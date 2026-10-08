import { afterEach, describe, expect, it } from 'vitest'
import { logMinutesOnDay, wrapUpDigest, wrapUpRowFilter, zonedDateKey, type WrapUpRow } from './wrapUp'
import { getDayPlan } from '../../../src/lib/dayPlan'
import { setAppTimeZoneSetting } from '../../../src/lib/timeZone'
import { TASK_DEFAULTS } from '../../../src/lib/taskDefaults'
import { taskKindFlags, type Task } from '../../../src/types/task'

const DAY = '2026-10-08'
const TZ = 'Asia/Tokyo'

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  }) as Task

/** アプリのタスクを DB の行に（同期で書く列と同じ名前） */
function toRow(t: Task): WrapUpRow {
  const flags = taskKindFlags(t.kind ?? 'todo')
  return {
    id: t.id,
    list_id: t.listId,
    parent_id: t.parentId,
    is_time_log: flags.isTimeLog,
    is_sleep: flags.isSleep,
    is_event: flags.isEvent,
    completed: t.completed,
    completed_at: t.completedAt,
    updated_at: t.updatedAt,
    scheduled_date: t.scheduledDate ?? null,
    due_date: t.dueDate,
    start_time: t.startTime,
    end_time: t.endTime,
    end_date: t.endDate ?? null,
    deleted_at: t.deletedAt ?? null,
    archived_at: t.archivedAt ?? null,
  }
}

afterEach(() => setAppTimeZoneSetting(null))

describe('logMinutesOnDay', () => {
  const log = (p: Partial<WrapUpRow>): WrapUpRow => ({ id: 'l', list_id: 'inbox', is_time_log: true, ...p })

  it('その日の中の記録はその長さ', () => {
    expect(logMinutesOnDay(log({ due_date: DAY, start_time: '09:00', end_time: '10:30' }), DAY)).toBe(90)
  })

  it('前の日の夜から続く記録は、その日の分だけ（終わりが始まり以前なら翌日まで）', () => {
    const night = log({ due_date: '2026-10-07', start_time: '23:00', end_time: '01:30' })
    expect(logMinutesOnDay(night, DAY)).toBe(90)
    expect(logMinutesOnDay(night, '2026-10-07')).toBe(60)
  })

  it('終わりの日があって終わりが始まり以前なら数えない。時刻の無い記録も 0', () => {
    expect(logMinutesOnDay(log({ due_date: DAY, end_date: DAY, start_time: '10:00', end_time: '09:00' }), DAY)).toBe(0)
    expect(logMinutesOnDay(log({ due_date: DAY, start_time: null, end_time: null }), DAY)).toBe(0)
  })
})

describe('zonedDateKey', () => {
  it('完了した瞬間を利用者のタイムゾーンの日にする', () => {
    // 10/7 15:30 UTC は東京の 10/8 0:30、ニューヨークの 10/7 11:30
    expect(zonedDateKey('2026-10-07T15:30:00Z', TZ)).toBe(DAY)
    expect(zonedDateKey('2026-10-07T15:30:00Z', 'America/New_York')).toBe('2026-10-07')
    expect(zonedDateKey('not a date', TZ)).toBeNull()
  })
})

describe('wrapUpDigest', () => {
  it('予定 n 件中 m 件・記録・残りを数える（予定・サブタスク・いつかのリスト・睡眠・消したものは入れない）', () => {
    const rows: WrapUpRow[] = [
      { id: 'open', list_id: 'inbox', scheduled_date: DAY },
      { id: 'openByDue', list_id: 'inbox', due_date: DAY },
      { id: 'done', list_id: 'inbox', completed: true, completed_at: '2026-10-08T03:00:00Z', scheduled_date: '2026-10-01' },
      { id: 'doneYesterday', list_id: 'inbox', completed: true, completed_at: '2026-10-07T03:00:00Z', scheduled_date: DAY },
      { id: 'event', list_id: 'inbox', is_event: true, scheduled_date: DAY, start_time: '13:00', end_time: '15:00' },
      { id: 'sub', list_id: 'inbox', parent_id: 'open', scheduled_date: DAY },
      { id: 'someday', list_id: 'someday-list', scheduled_date: DAY },
      { id: 'trash', list_id: 'inbox', scheduled_date: DAY, deleted_at: '2026-10-08T01:00:00Z' },
      { id: 'log', list_id: 'inbox', is_time_log: true, due_date: DAY, start_time: '10:00', end_time: '12:30' },
      { id: 'sleep', list_id: 'inbox', is_time_log: true, is_sleep: true, due_date: DAY, start_time: '00:00', end_time: '07:00' },
    ]
    expect(wrapUpDigest(rows, DAY, TZ, new Set(['someday-list']))).toEqual({ done: 1, total: 3, open: 2, loggedMinutes: 150 })
  })

  it('完了時刻の無い古い行は最後に変えた日で数える', () => {
    const rows: WrapUpRow[] = [{ id: 'old', list_id: 'inbox', completed: true, completed_at: null, updated_at: '2026-10-08T05:00:00Z' }]
    expect(wrapUpDigest(rows, DAY, TZ).done).toBe(1)
  })

  it('アプリの今日の計画（getDayPlan）と同じ数になる', () => {
    setAppTimeZoneSetting(TZ)
    const tasks: Task[] = [
      task('a', { scheduledDate: DAY }),
      task('b', { dueDate: DAY }),
      task('c', { scheduledDate: DAY, dueDate: '2026-10-20' }),
      task('d', { scheduledDate: '2026-10-09', dueDate: DAY }),
      task('carry', { scheduledDate: '2026-10-05' }),
      // 東京の 0:30 に完了（UTC では前の日）
      task('doneLate', { completed: true, completedAt: '2026-10-07T15:30:00Z', scheduledDate: '2026-10-07' }),
      // 東京の 23:50 に完了（UTC では同じ日の昼）
      task('doneToday', { completed: true, completedAt: '2026-10-08T14:50:00Z' }),
      // 東京では次の日
      task('doneTomorrow', { completed: true, completedAt: '2026-10-08T15:10:00Z', scheduledDate: DAY }),
      task('event', { kind: 'event', scheduledDate: DAY, startTime: '17:00', endTime: '22:00' }),
      task('sub', { parentId: 'a', scheduledDate: DAY }),
      task('someday', { listId: 'someday-list', scheduledDate: DAY }),
      task('archived', { scheduledDate: DAY, archivedAt: '2026-10-08T01:00:00Z' }),
      task('log1', { kind: 'log', dueDate: DAY, startTime: '09:00', endTime: '10:15' }),
      task('logNight', { kind: 'log', dueDate: '2026-10-07', startTime: '23:30', endTime: '00:45' }),
      task('logIntoTomorrow', { kind: 'log', dueDate: DAY, startTime: '23:00', endTime: '02:00' }),
      task('sleep', { kind: 'sleep', dueDate: DAY, startTime: '01:00', endTime: '07:00' }),
      task('logDeleted', { kind: 'log', dueDate: DAY, startTime: '12:00', endTime: '13:00', deletedAt: '2026-10-08T05:00:00Z' }),
    ]
    const excluded = new Set(['someday-list'])
    const plan = getDayPlan(tasks, DAY, excluded)
    const digest = wrapUpDigest(tasks.map(toRow), DAY, TZ, excluded)
    expect(digest).toEqual({
      done: plan.done.length,
      total: plan.done.length + plan.open.length,
      open: plan.open.length,
      loggedMinutes: plan.loggedMinutes,
    })
    // 念のため中身も: 完了 2（doneLate・doneToday）、残り 3（a・b・c）、記録 75 + 45 + 60 分
    expect(digest).toEqual({ done: 2, total: 5, open: 3, loggedMinutes: 180 })
  })
})

describe('wrapUpRowFilter', () => {
  it('その日・前の日に置いたもの、その日に終わる記録、その日のあたりに完了したものを選ぶ', () => {
    const filter = wrapUpRowFilter(DAY)
    expect(filter).toContain('scheduled_date.eq.2026-10-08')
    expect(filter).toContain('due_date.eq.2026-10-07')
    expect(filter).toContain('end_date.eq.2026-10-08')
    // UTC+14 の 0 時（10/7 10:00 UTC）より前から
    expect(filter).toContain('completed_at.gte."2026-10-07T09:00:00.000Z"')
    expect(filter).toContain('and(completed.is.true,completed_at.is.null,updated_at.gte."2026-10-07T09:00:00.000Z")')
  })
})
