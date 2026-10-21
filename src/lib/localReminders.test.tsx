import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import type { Habit } from '../types/habit'
import { TASK_DEFAULTS } from './taskDefaults'
import { setAppTimeZoneSetting } from './timeZone'
import { checkLocalReminders, dayNumbers, reminderCandidates } from './localReminders'
import { getDayReviews } from './weekReview'
import { fromDateKey } from './dateKey'
import { morningDigest } from '../../supabase/functions/daily-reminders/schedule'
import { MESSAGES, morningPayload } from '../../supabase/functions/daily-reminders/payload'
import { previousDay, wrapUpDigest, wrapUpRowFilter, type WrapUpRow } from '../../supabase/functions/daily-reminders/wrapUp'
import {
  EXAMPLE_DAY,
  EXAMPLE_EXCLUDED,
  EXAMPLE_RESULT,
  exampleHabits,
  exampleTasks,
  toWrapUpHabitRow,
  toWrapUpRow,
} from '../test/dayResultExample'

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
    habits: [],
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
  task('open', { scheduledDate: DAY, startTime: '09:00', endTime: '10:00' }),
  task('done', { scheduledDate: DAY, startTime: '11:00', endTime: '12:00', completed: true, completedAt: '2026-10-08T03:00:00Z' }),
  task('log', { kind: 'log', dueDate: DAY, startTime: '19:00', endTime: '20:30' }),
]

describe('タブの通知: 夜のまとめ（Web Push が使えないとき）', () => {
  it('アプリのタイムゾーンで決めた時刻に、今日の計画と同じ数字で 1 回だけ出す。押すと締めを開く', () => {
    // 13:00 UTC = 東京の 22:00
    vi.setSystemTime(new Date('2026-10-08T13:00:00Z'))
    const onWrapUp = check(dayTasks())
    expect(FakeNotification.shown).toHaveLength(1)
    const n = FakeNotification.shown[0]!
    expect(n.title).toBe('Evening summary')
    expect(n.options.body).toBe('Today: 1 of 2 plans · 1h 30m unplanned · 1h 30m logged')
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
  const Y = EXAMPLE_DAY

  /** サーバーと同じ: DB から条件で読み（その日のあたりの行と、その日から移した予定のある行）、利用者のタイムゾーンの昨日を数える */
  const serverYesterday = (tasks: Task[], habits: Habit[]) => {
    const yesterday = previousDay(TODAY)
    const filter = wrapUpRowFilter(yesterday)
    const movedFrom = (r: WrapUpRow) => Array.isArray(r.moved_plans) && r.moved_plans.some((p: { date?: string }) => p.date === yesterday)
    const rows = tasks.map(toWrapUpRow).filter((r) => matchesOrFilter(r, filter) || movedFrom(r))
    return wrapUpDigest(rows, habits.map(toWrapUpHabitRow), yesterday, { date: TODAY, minutes: 8 * 60 }, EXAMPLE_EXCLUDED)
  }

  it('サーバー（wrapUp.ts）・タブの通知・今日の計画の見出しと週のふりかえり（getDayReviews）が同じ数になる', () => {
    vi.setSystemTime(new Date('2026-10-08T23:00:00Z'))
    const tasks = exampleTasks()
    const habits = exampleHabits()
    const local = dayNumbers(tasks, habits, Y, EXAMPLE_EXCLUDED)
    expect(serverYesterday(tasks, habits)).toEqual(local)
    const [review] = getDayReviews(tasks, habits, [fromDateKey(Y)], EXAMPLE_EXCLUDED, new Date(2026, 9, 9, 8, 0))
    expect(local).toEqual({
      planned: review!.timedPlanned,
      followed: review!.followed,
      unplannedMinutes: review!.unplannedMinutes,
      loggedMinutes: review!.loggedMinutes,
    })
    expect(local).toEqual(EXAMPLE_RESULT)
  })

  it('タブの朝のまとめは、サーバーの朝のまとめと同じ本文（1 行目が今日、2 行目が昨日）', () => {
    // 23:00 UTC = 東京の 10/9 8:00
    vi.setSystemTime(new Date('2026-10-08T23:00:00Z'))
    const tasks = [...exampleTasks(), task('today', { scheduledDate: TODAY })]
    const habits = exampleHabits()
    checkLocalReminders({
      tasks,
      habits,
      excludedListIds: EXAMPLE_EXCLUDED,
      daily: { planTime: '08:00', wrapUpTime: null },
      settings: { eventReminderMinutes: null, dueReminders: false, recordPrompts: false },
      activeTimer: null,
      onOpen: vi.fn(),
      onRecord: vi.fn(),
      onOpenTask: vi.fn(),
      onWrapUp: vi.fn(),
    })
    expect(FakeNotification.shown).toHaveLength(1)
    const server = morningPayload(
      MESSAGES.en,
      morningDigest(reminderCandidates(tasks, EXAMPLE_EXCLUDED), TODAY),
      serverYesterday(tasks, habits),
    )
    expect(FakeNotification.shown[0]!.options.body).toBe(server.body)
    expect(server.body).toBe('1 planned\nYesterday: 3 of 5 plans · 1h unplanned · 3h 55m logged')
  })

  it('昨日に数えた予定も記録も無ければ昨日の行を出さない', () => {
    vi.setSystemTime(new Date('2026-10-08T23:00:00Z'))
    checkLocalReminders({
      tasks: [
        task('t', { scheduledDate: TODAY }),
        task('untimed', { scheduledDate: Y }),
        task('event', { kind: 'event', scheduledDate: Y, startTime: '10:00', endTime: '12:00' }),
      ],
      habits: [],
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
