import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { setAppTimeZoneSetting } from './timeZone'
import { checkLocalReminders } from './localReminders'

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
