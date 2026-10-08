import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import type { CalendarEvent } from '../types/calendarEvent'
import { dayLoad, freeMinutesOfDay, plannedTodoMinutes } from './dayLoad'
import { busyMinutes } from './freeSlots'
import { TASK_DEFAULTS } from './taskDefaults'

const task = (id: string, over: Partial<Task> = {}): Task => ({
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
})

const DAY = '2026-10-12'
const h = (hh: number, mm = 0) => hh * 60 + mm

const gEvent = (id: string, startTime: string, endTime: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  summary: id,
  start: '',
  end: '',
  startTime,
  endTime,
  date: DAY,
  isAllDay: false,
  ...over,
})

describe('busyMinutes', () => {
  it('counts overlapping spans once', () => {
    expect(
      busyMinutes([
        { start: h(9), end: h(12) },
        { start: h(11), end: h(13) },
        { start: h(15), end: h(16) },
        { start: h(15, 15), end: h(15, 45) },
      ]),
    ).toBe(h(5))
  })

  it('is 0 with nothing', () => {
    expect(busyMinutes([])).toBe(0)
  })
})

describe('freeMinutesOfDay', () => {
  it('subtracts events (授業・バイト) and Google events from the daily target, not To-Dos or logs', () => {
    const tasks = [
      task('class', { kind: 'event', scheduledDate: DAY, startTime: '09:00', endTime: '12:00' }),
      task('es', { scheduledDate: DAY, startTime: '13:00', endTime: '14:00' }),
      task('log', { kind: 'log', dueDate: DAY, startTime: '13:00', endTime: '14:00' }),
      task('other-day', { kind: 'event', scheduledDate: '2026-10-13', startTime: '09:00', endTime: '12:00' }),
    ]
    const events = [gEvent('zemi', '11:00', '12:30'), gEvent('allday', '', '', { isAllDay: true })]
    // 予定 9:00–12:30（重なりは 1 回）= 3.5 時間
    expect(freeMinutesOfDay(tasks, events, DAY, h(8))).toBe(h(4, 30))
  })

  it('does not go below 0 when events fill more than the target', () => {
    const tasks = [
      task('class', { kind: 'event', scheduledDate: DAY, startTime: '09:00', endTime: '16:00' }),
      task('shift', { kind: 'event', scheduledDate: DAY, startTime: '17:00', endTime: '22:00' }),
    ]
    expect(freeMinutesOfDay(tasks, [], DAY, h(8))).toBe(0)
  })
})

describe('plannedTodoMinutes', () => {
  it('adds timed To-Dos by length and untimed ones by estimate; skips ones without an estimate', () => {
    const tasks = [
      task('report', { scheduledDate: DAY, estimateMinutes: 240 }),
      task('es', { scheduledDate: DAY, startTime: '20:00', endTime: '21:30', estimateMinutes: 30 }),
      task('no-estimate', { scheduledDate: DAY }),
      task('due-only', { dueDate: DAY, estimateMinutes: 30 }),
    ]
    expect(plannedTodoMinutes(tasks, DAY)).toBe(240 + 90 + 30)
  })

  it('leaves out events, logs, subtasks, deleted, other days and someday / checklist lists', () => {
    const tasks = [
      task('class', { kind: 'event', scheduledDate: DAY, startTime: '09:00', endTime: '12:00' }),
      task('log', { kind: 'log', dueDate: DAY, startTime: '13:00', endTime: '14:00' }),
      task('child', { scheduledDate: DAY, estimateMinutes: 60, parentId: 'p' }),
      task('deleted', { scheduledDate: DAY, estimateMinutes: 60, deletedAt: '2026-10-01T00:00:00Z' }),
      task('later', { scheduledDate: '2026-10-13', estimateMinutes: 60 }),
      task('someday', { scheduledDate: DAY, estimateMinutes: 60, listId: 'someday' }),
    ]
    expect(plannedTodoMinutes(tasks, DAY, new Set(['someday']))).toBe(0)
  })
})

describe('dayLoad', () => {
  // 授業 9〜12 時・バイト 17〜21 時（7 時間）、目安 8 時間 → 空き 1 時間
  const busyDay = [
    task('class', { kind: 'event', scheduledDate: DAY, startTime: '09:00', endTime: '12:00' }),
    task('shift', { kind: 'event', scheduledDate: DAY, startTime: '17:00', endTime: '21:00' }),
  ]

  it('is over when the placed To-Dos do not fit the free time', () => {
    const tasks = [...busyDay, task('report', { scheduledDate: DAY, estimateMinutes: 120 })]
    expect(dayLoad(tasks, [], DAY, { capacityMinutes: h(8) })).toEqual({ freeMinutes: h(1), plannedMinutes: h(2), over: true })
  })

  it('is not over when they fit exactly', () => {
    const tasks = [...busyDay, task('report', { scheduledDate: DAY, estimateMinutes: 60 })]
    expect(dayLoad(tasks, [], DAY, { capacityMinutes: h(8) }).over).toBe(false)
  })

  it('a day with no events has the whole target free', () => {
    expect(dayLoad([], [], DAY, { capacityMinutes: h(8) })).toEqual({ freeMinutes: h(8), plannedMinutes: 0, over: false })
  })
})
