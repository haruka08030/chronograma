import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
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

// 2026-10-13 は火曜
const TUE = '2026-10-13'
const run = (over: Partial<LogSuggestionInput>) =>
  logSuggestions({
    tasks: [],
    query: '',
    window: null,
    labelOf: () => ({ category: null, color: null }),
    todayKey: TUE,
    ...over,
  })
const titles = (over: Partial<LogSuggestionInput>) => run(over).map((s) => `${s.source}:${s.title}`)

describe('記録の名前の候補の出どころ', () => {
  it('予定（アプリ・Google・時間を決めた To-Do）は出さない（チェックで記録できる）', () => {
    const tasks = [
      task({ kind: 'event', title: 'ゼミ', scheduledDate: TUE, startTime: '15:00', endTime: '16:30' }),
      task({ title: 'ES', scheduledDate: TUE, startTime: '15:00', endTime: '16:00' }),
    ]
    expect(titles({ tasks, window: { dateKey: TUE, start: '15:10', end: '15:10' } })).toEqual([])
    expect(titles({ tasks, query: 'ゼミ', window: { dateKey: TUE, start: '15:10', end: '15:10' } })).toEqual([])
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
    expect(run({ tasks, window: { dateKey: TUE, start: '13:00', end: '14:30' } })[0]).toEqual({
      title: '授業',
      category: '授業',
      typicalMinutes: 100,
      source: 'usual',
    })
  })

  it('空欄では、いつもやっていることの後に最近よく記録するもの（直近 30 日の回数順）を出す', () => {
    const tasks = [
      log('授業', '2026-10-06', '13:00', '14:30'),
      log('授業', '2026-09-29', '13:00', '14:30'),
      log('読書', '2026-10-12', '21:00', '22:00'), // いちばん新しいが 1 回
      log('ジム', '2026-10-10', '18:00', '19:00'),
      log('ジム', '2026-10-08', '18:00', '19:00'),
      log('ジム', '2026-10-01', '18:00', '19:00'),
    ]
    expect(titles({ tasks, window: { dateKey: TUE, start: '13:00', end: '14:30' } })).toEqual(['usual:授業', 'log:ジム', 'log:読書'])
    expect(titles({ tasks })).toEqual(['log:ジム', 'log:授業', 'log:読書'])
  })

  it('打った後は、合う今日の To-Do（1 件）→ 過去の記録。合わせて 3 件まで', () => {
    const tasks = [
      log('STAT 講義', '2026-10-06', '10:00', '11:00'),
      log('STAT 勉強', '2026-10-06', '20:00', '21:00'),
      log('STAT 復習', '2026-10-05', '20:00', '21:00'),
    ]
    const todos = [task({ title: 'STAT HW#3', estimateMinutes: 60 }), task({ title: 'STAT HW#4' })]
    expect(titles({ tasks, todos, query: 'stat', window: { dateKey: TUE, start: '10:30', end: '10:30' } })).toEqual([
      'todo:STAT HW#3',
      'log:STAT 勉強',
      'log:STAT 講義',
    ])
    expect(run({ todos, query: 'hw' })[0]).toMatchObject({ source: 'todo', taskId: todos[0]!.id, typicalMinutes: 60 })
  })
})
