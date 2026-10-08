import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { taskKindFlags, type Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { setAppTimeZoneSetting } from './timeZone'
import { checkLocalReminders, dayNumbers, reminderCandidates } from './localReminders'
import { getDayReviews } from './weekReview'
import { fromDateKey } from './dateKey'
import { morningDigest } from '../../supabase/functions/daily-reminders/schedule'
import { MESSAGES, morningPayload } from '../../supabase/functions/daily-reminders/payload'
import { previousDay, wrapUpDigest, wrapUpRowFilter, type WrapUpRow } from '../../supabase/functions/daily-reminders/wrapUp'

const DAY = '2026-10-08'

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

/** タブの通知（Service Worker の無いとき）の偽物 */
class FakeNotification {
  static permission = 'granted'
  static shown: FakeNotification[] = []
  onclick: (() => void) | null = null
  title: string
  options: { body?: string; tag?: string }
  constructor(title: string, options: { body?: string; tag?: string }) {
    this.title = title
    this.options = options
    FakeNotification.shown.push(this)
  }
  close() {}
}

const hadNotification = 'Notification' in window
const originalNotification = (window as { Notification?: unknown }).Notification

beforeEach(() => {
  FakeNotification.shown = []
  ;(window as { Notification?: unknown }).Notification = FakeNotification
  setAppTimeZoneSetting('Asia/Tokyo')
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  setAppTimeZoneSetting(null)
  if (hadNotification) (window as { Notification?: unknown }).Notification = originalNotification
  else delete (window as { Notification?: unknown }).Notification
})

function check(tasks: Task[], onWrapUp = vi.fn()) {
  checkLocalReminders({
    tasks,
    excludedListIds: new Set(),
    daily: { planTime: null, wrapUpTime: '22:00' },
    settings: { eventReminderMinutes: null, dueReminders: false, recordPrompts: false },
    activeTimer: null,
    onOpen: vi.fn(),
    onRecord: vi.fn(),
    onOpenTask: vi.fn(),
    onWrapUp,
  })
  return onWrapUp
}

const dayTasks = () => [
  task('open', { scheduledDate: DAY }),
  task('done', { scheduledDate: DAY, completed: true, completedAt: '2026-10-08T03:00:00Z' }),
  task('log', { kind: 'log', dueDate: DAY, startTime: '19:00', endTime: '20:30' }),
]

describe('タブの通知: 夜の締め（Web Push が使えないとき）', () => {
  it('アプリのタイムゾーンで決めた時刻に、今日の計画と同じ数字で 1 回だけ出す。押すと締めを開く', () => {
    // 13:00 UTC = 東京の 22:00
    vi.setSystemTime(new Date('2026-10-08T13:00:00Z'))
    const onWrapUp = check(dayTasks())
    expect(FakeNotification.shown).toHaveLength(1)
    const n = FakeNotification.shown[0]!
    expect(n.title).toBe('Wrap up the day')
    expect(n.options.body).toBe('Today: 1 of 2 done · 1h 30m logged · 1 left')
    expect(n.options.tag).toBe('chronograma-wrap-up')
    n.onclick?.()
    expect(onWrapUp).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date('2026-10-08T13:01:00Z'))
    check(dayTasks())
    expect(FakeNotification.shown).toHaveLength(1)
  })

  it('時刻の前には出さない', () => {
    vi.setSystemTime(new Date('2026-10-08T12:59:00Z'))
    check(dayTasks())
    expect(FakeNotification.shown).toHaveLength(0)
  })

  it('記録が 0 の日は出さず、時刻から 60 分の間に記録すれば出す', () => {
    vi.setSystemTime(new Date('2026-10-08T13:00:00Z'))
    const noLogs = dayTasks().filter((t) => t.id !== 'log')
    check(noLogs)
    expect(FakeNotification.shown).toHaveLength(0)
    vi.setSystemTime(new Date('2026-10-08T13:20:00Z'))
    check(dayTasks())
    expect(FakeNotification.shown).toHaveLength(1)
  })
})

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

/** PostgREST の `or` の条件（`wrapUpRowFilter` が作る形: eq / gte / is と and(...)）を行に当てる。サーバーが DB から読む行を再現する */
function matchesOrFilter(row: WrapUpRow, filter: string): boolean {
  const split = (s: string): string[] => {
    const out: string[] = []
    let depth = 0
    let quoted = false
    let cur = ''
    for (const ch of s) {
      if (ch === '"') quoted = !quoted
      if (!quoted && ch === '(') depth++
      if (!quoted && ch === ')') depth--
      if (!quoted && depth === 0 && ch === ',') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out
  }
  const term = (t: string): boolean => {
    if (t.startsWith('and(')) return split(t.slice(4, -1)).every(term)
    const [field, op, ...rest] = t.split('.')
    const value = rest.join('.').replace(/^"|"$/g, '')
    const v = (row as unknown as Record<string, unknown>)[field!] ?? null
    if (op === 'eq') return v === value
    if (op === 'gte') return typeof v === 'string' && Date.parse(v) >= Date.parse(value)
    if (op === 'is') return value === 'null' ? v === null : v === (value === 'true')
    throw new Error(`unknown filter ${t}`)
  }
  return split(filter).some(term)
}

describe('朝のまとめの「昨日」（#278）', () => {
  const TODAY = '2026-10-09'
  const Y = '2026-10-08'
  const excluded = new Set(['someday-list', 'checklist-list'])
  // 東京の日の境目（0 時）の前後・日をまたぐ記録・睡眠・予定・サブタスク・いつか / チェックリスト
  const tricky = (): Task[] => [
    task('a', { scheduledDate: Y }),
    task('b', { dueDate: Y }),
    task('carry', { scheduledDate: '2026-10-05' }),
    // 東京の昨日 0:30 に完了（UTC ではおととい）
    task('doneJustAfterMidnight', { completed: true, completedAt: '2026-10-07T15:30:00Z', scheduledDate: '2026-10-07' }),
    // 東京の昨日 23:50 に完了
    task('doneLate', { completed: true, completedAt: '2026-10-08T14:50:00Z' }),
    // 東京の今日 0:10 に完了（UTC では昨日）→ 昨日には入れない
    task('doneToday', { completed: true, completedAt: '2026-10-08T15:10:00Z', scheduledDate: Y }),
    // 東京のおととい 23:00 に完了 → 昨日に置いていても入れない
    task('doneBefore', { completed: true, completedAt: '2026-10-07T14:00:00Z', scheduledDate: Y }),
    // 完了時刻の無い古い行は最後に変えた日（東京の昨日 14:00）
    task('doneOld', { completed: true, completedAt: null, updatedAt: '2026-10-08T05:00:00Z' }),
    task('event', { kind: 'event', scheduledDate: Y, startTime: '17:00', endTime: '22:00' }),
    task('sub', { parentId: 'a', scheduledDate: Y }),
    task('subDone', { parentId: 'a', completed: true, completedAt: '2026-10-08T03:00:00Z' }),
    task('someday', { listId: 'someday-list', scheduledDate: Y }),
    task('checklistDone', { listId: 'checklist-list', completed: true, completedAt: '2026-10-08T03:00:00Z' }),
    task('trash', { scheduledDate: Y, deletedAt: '2026-10-08T01:00:00Z' }),
    task('log1', { kind: 'log', dueDate: Y, startTime: '09:00', endTime: '10:15' }),
    // おとといの夜から続く記録（昨日の分は 45 分）
    task('logNight', { kind: 'log', dueDate: '2026-10-07', startTime: '23:30', endTime: '00:45' }),
    // 終わりの日つき（昨日の分は 60 分）
    task('logEndDate', { kind: 'log', dueDate: '2026-10-07', endDate: Y, startTime: '22:00', endTime: '01:00' }),
    // 今日へ続く記録（昨日の分は 60 分）
    task('logIntoToday', { kind: 'log', dueDate: Y, startTime: '23:00', endTime: '02:00' }),
    task('sleep', { kind: 'sleep', dueDate: Y, startTime: '01:00', endTime: '07:00' }),
    task('logDeleted', { kind: 'log', dueDate: Y, startTime: '12:00', endTime: '13:00', deletedAt: '2026-10-08T05:00:00Z' }),
    task('logToday', { kind: 'log', dueDate: TODAY, startTime: '06:00', endTime: '07:00' }),
  ]

  /** サーバーと同じ: DB から条件で読み（削除・アーカイブは除く）、利用者のタイムゾーンの昨日を数える */
  const serverYesterday = (tasks: Task[]) => {
    const yesterday = previousDay(TODAY)
    const filter = wrapUpRowFilter(yesterday)
    const rows = tasks.map(toRow).filter((r) => !r.deleted_at && !r.archived_at && matchesOrFilter(r, filter))
    return wrapUpDigest(rows, yesterday, 'Asia/Tokyo', excluded)
  }

  it('サーバー（wrapUp.ts）・タブの通知（getDayPlan）・週のふりかえりの日ごとの数（getDayReviews）が同じ数になる', () => {
    vi.setSystemTime(new Date('2026-10-08T23:00:00Z'))
    const tasks = tricky()
    const local = dayNumbers(tasks, Y, excluded)
    const server = serverYesterday(tasks)
    expect(server).toEqual(local)
    const [review] = getDayReviews(tasks, [], [fromDateKey(Y)], excluded, new Date(2026, 9, 9, 8, 0))
    expect({ done: local.done, total: local.total, loggedMinutes: local.loggedMinutes }).toEqual({
      done: review!.done,
      total: review!.total,
      loggedMinutes: review!.loggedMinutes,
    })
    // 中身も: 完了 3（doneJustAfterMidnight・doneLate・doneOld）、残り 2（a・b）、記録 75 + 45 + 60 + 60 分
    expect(local).toEqual({ done: 3, total: 5, open: 2, loggedMinutes: 240 })
  })

  it('タブの朝のまとめは、サーバーの朝のまとめと同じ本文（1 行目が今日、2 行目が昨日）', () => {
    // 23:00 UTC = 東京の 10/9 8:00
    vi.setSystemTime(new Date('2026-10-08T23:00:00Z'))
    const tasks = tricky()
    checkLocalReminders({
      tasks,
      excludedListIds: excluded,
      daily: { planTime: '08:00', wrapUpTime: null },
      settings: { eventReminderMinutes: null, dueReminders: false, recordPrompts: false },
      activeTimer: null,
      onOpen: vi.fn(),
      onRecord: vi.fn(),
      onOpenTask: vi.fn(),
      onWrapUp: vi.fn(),
    })
    expect(FakeNotification.shown).toHaveLength(1)
    const server = morningPayload(MESSAGES.en, morningDigest(reminderCandidates(tasks, excluded), TODAY), serverYesterday(tasks))
    expect(FakeNotification.shown[0]!.options.body).toBe(server.body)
    expect(server.body).toBe('1 overdue\nYesterday: 3 of 5 done · 4h logged')
  })

  it('昨日に To-Do も記録も無ければ昨日の行を出さない', () => {
    vi.setSystemTime(new Date('2026-10-08T23:00:00Z'))
    checkLocalReminders({
      tasks: [
        task('t', { scheduledDate: TODAY }),
        task('event', { kind: 'event', scheduledDate: Y, startTime: '10:00', endTime: '12:00' }),
      ],
      excludedListIds: new Set(),
      daily: { planTime: '08:00', wrapUpTime: null },
      settings: { eventReminderMinutes: null, dueReminders: false, recordPrompts: false },
      activeTimer: null,
      onOpen: vi.fn(),
      onRecord: vi.fn(),
      onOpenTask: vi.fn(),
      onWrapUp: vi.fn(),
    })
    expect(FakeNotification.shown[0]!.options.body).toBe('1 planned')
  })
})
