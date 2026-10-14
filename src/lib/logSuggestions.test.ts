import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import type { CalendarEvent } from '../types/calendarEvent'
import { logSuggestions, type LogSuggestionInput } from './logSuggestions'
import { TASK_DEFAULTS } from './taskDefaults'

/** 記録の名前の候補の出どころ（#416） */
function task(over: Partial<Task>): Task {
  return {
    ...TASK_DEFAULTS,
    id: Math.random().toString(36).slice(2),
    title: 't',
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
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
  }
}

const log = (title: string, dueDate: string, startTime: string, endTime: string, category: string | null = null) =>
  task({ kind: 'log', completed: true, title, dueDate, startTime, endTime, category, tags: category ? [category] : [] })

const gEvent = (summary: string, date: string, startTime: string, endTime: string): CalendarEvent => ({
  id: summary,
  summary,
  start: `${date}T${startTime}:00+09:00`,
  end: `${date}T${endTime}:00+09:00`,
  startTime,
  endTime,
  date,
  isAllDay: false,
})

// 2026-10-13 は火曜
const TUE = '2026-10-13'
const run = (over: Partial<LogSuggestionInput>) =>
  logSuggestions({
    tasks: [],
    events: [],
    query: '',
    window: null,
    labelOf: () => ({ category: null, color: null }),
    todayKey: TUE,
    ...over,
  })
const titles = (over: Partial<LogSuggestionInput>) => run(over).map((s) => `${s.source}:${s.title}`)

describe('記録の名前の候補の出どころ', () => {
  it('空欄では、記録する時間に重なる予定（アプリ・Google）を始まり順に出す。重ならない予定は出さない', () => {
    const tasks = [
      task({ kind: 'event', title: 'ゼミ', scheduledDate: TUE, startTime: '15:00', endTime: '16:30' }),
      task({ kind: 'event', title: 'バイト', scheduledDate: TUE, startTime: '18:00', endTime: '22:00' }),
    ]
    const events = [gEvent('面談', TUE, '14:30', '15:30')]
    expect(titles({ tasks, events, window: { dateKey: TUE, start: '15:10', end: '15:10' } })).toEqual(['plan:面談', 'plan:ゼミ'])
  })

  it('予定は時刻を、時間を決めた To-Do は紐づける id も持つ（予定は紐づけない）', () => {
    const todo = task({ title: 'ES', scheduledDate: TUE, startTime: '10:00', endTime: '11:00' })
    const ev = task({ kind: 'event', title: '授業', scheduledDate: TUE, startTime: '10:30', endTime: '12:00' })
    const out = run({ tasks: [todo, ev], window: { dateKey: TUE, start: '09:30', end: '12:00' } })
    expect(out.map((s) => [s.title, s.taskId ?? null, s.startTime])).toEqual([
      ['ES', todo.id, '10:00'],
      ['授業', null, '10:30'],
    ])
  })

  it('空欄では、同じ曜日・同じ時間帯（前後 30 分）に直近 8 週で 2 回以上記録したものも出す', () => {
    const tasks = [
      log('授業', '2026-10-06', '13:00', '14:30', '授業'),
      log('授業', '2026-09-29', '12:40', '14:30', '授業'),
      log('昼ごはん', '2026-10-06', '12:00', '12:45'), // 時間帯が違う
      log('昼ごはん', '2026-09-29', '12:00', '12:45'),
      log('ジム', '2026-10-07', '13:00', '14:00'), // 曜日が違う
      log('ジム', '2026-09-30', '13:00', '14:00'),
      log('読書', '2026-10-06', '13:15', '14:00'), // 1 回だけ
    ]
    expect(run({ tasks, window: { dateKey: TUE, start: '13:00', end: '14:30' } })).toEqual([
      { title: '授業', category: '授業', typicalMinutes: 100, source: 'usual' },
    ])
  })

  it('打った後は、合う予定 → 合う今日の To-Do（1 件）→ 過去の記録。同じ名前は先のものだけ、合わせて 3 件まで', () => {
    const tasks = [
      task({ kind: 'event', title: 'STAT 講義', scheduledDate: TUE, startTime: '10:00', endTime: '11:00' }),
      log('STAT 講義', '2026-10-06', '10:00', '11:00'),
      log('STAT 勉強', '2026-10-06', '20:00', '21:00'),
      log('STAT 復習', '2026-10-05', '20:00', '21:00'),
    ]
    const todos = [task({ title: 'STAT HW#3', estimateMinutes: 60 }), task({ title: 'STAT HW#4' })]
    expect(titles({ tasks, todos, query: 'stat', window: { dateKey: TUE, start: '10:30', end: '10:30' } })).toEqual([
      'plan:STAT 講義',
      'todo:STAT HW#3',
      'log:STAT 勉強',
    ])
    expect(run({ todos, query: 'hw' })[0]).toMatchObject({ source: 'todo', taskId: todos[0]!.id, typicalMinutes: 60 })
  })
})
