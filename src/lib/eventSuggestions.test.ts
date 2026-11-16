import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../types/calendarEvent'
import type { Task } from '../types/task'
import { planColorForTitle, planTitleSuggestions } from './eventSuggestions'
import { googleEventIdForTask } from './googlePush'

let n = 0
const task = (title: string, over: Partial<Task> = {}): Task =>
  ({
    id: `t${n++}`,
    kind: 'event',
    title,
    listId: 'work',
    scheduledDate: '2026-10-10',
    startTime: '10:00',
    createdAt: '2026-10-01T00:00:00Z',
    deletedAt: null,
    color: null,
    ...over,
  }) as Task

const gEvent = (summary: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `g${n++}`,
  summary,
  start: '',
  end: '',
  date: '2026-10-12',
  startTime: '10:00',
  endTime: '11:00',
  isAllDay: false,
  ...over,
})

describe('planTitleSuggestions', () => {
  it('始まり → 単語の頭 → 含む の順で、打ったものと同じ名前は出さない', () => {
    const tasks = [task('英語のゼミ'), task('ゼミ 発表'), task('ゼミ'), task('アルバイト')]
    expect(planTitleSuggestions('event', 'ゼミ', tasks, []).map((s) => s.title)).toEqual(['ゼミ 発表', '英語のゼミ'])
  })

  it('予定はアプリの予定と Google の予定、To-Do は To-Do だけ。記録・ゴミ箱は出さない', () => {
    const tasks = [
      task('バイト 渋谷'),
      task('バイト 課題', { kind: 'todo' }),
      task('バイト 記録', { kind: 'log' }),
      task('バイト 消した', { deletedAt: '2026-10-02T00:00:00Z' }),
    ]
    const events = [
      gEvent('バイト 新宿'),
      gEvent('バイト 送った', { id: googleEventIdForTask('x') }),
      gEvent('バイト 休み', { skipped: true }),
    ]
    expect(
      planTitleSuggestions('event', 'バイト', tasks, events)
        .map((s) => s.title)
        .sort(),
    ).toEqual(['バイト 新宿', 'バイト 渋谷'])
    expect(planTitleSuggestions('todo', 'バイト', tasks, events).map((s) => s.title)).toEqual(['バイト 課題'])
  })

  it('同じ段は回数の多い順、色は一番新しいもの', () => {
    const tasks = [
      task('部活 A'),
      task('部活 B', { scheduledDate: '2026-10-01', color: '#111111' }),
      task('部活 B', { scheduledDate: '2026-10-20', color: '#222222' }),
    ]
    expect(planTitleSuggestions('event', '部活', tasks, [])).toEqual([
      { title: '部活 B', color: '#222222' },
      { title: '部活 A', color: null },
    ])
  })

  it('空欄は出さない', () => {
    expect(planTitleSuggestions('event', ' ', [task('ゼミ')], [])).toEqual([])
  })
})

describe('planColorForTitle', () => {
  it('同じ名前（全角半角・大文字小文字の違いは同じ）の一番新しいものの色', () => {
    const tasks = [
      task('ｚｏｏｍ', { scheduledDate: '2026-10-01', color: '#111111' }),
      task('Zoom', { scheduledDate: '2026-10-05', color: '#222222' }),
    ]
    expect(planColorForTitle('event', 'zoom', tasks, [])).toBe('#222222')
    expect(planColorForTitle('event', 'zoo', tasks, [])).toBeNull()
  })

  it('Google の予定はカレンダーの色だけなら色なし、自分で付けた色なら使う', () => {
    expect(planColorForTitle('event', 'ゼミ', [], [gEvent('ゼミ', { color: '#7986cb', baseColor: '#7986cb' })])).toBeNull()
    expect(planColorForTitle('event', 'ゼミ', [], [gEvent('ゼミ', { color: '#e67c73', baseColor: '#7986cb' })])).toBe('#e67c73')
  })
})
