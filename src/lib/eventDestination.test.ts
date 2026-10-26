import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../types/calendarEvent'
import type { Task } from '../types/task'
import { inferEventDestination } from './eventDestination'
import { googleEventIdForTask } from './googlePush'

const appEvent = (title: string, over: Partial<Task> = {}): Task =>
  ({
    id: `t-${title}-${over.scheduledDate ?? ''}`,
    kind: 'event',
    title,
    listId: 'work',
    scheduledDate: '2026-10-10',
    startTime: '10:00',
    createdAt: '2026-10-01T00:00:00Z',
    deletedAt: null,
    ...over,
  }) as Task

const gEvent = (summary: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `g${summary}`,
  summary,
  start: '',
  end: '',
  date: '2026-10-12',
  startTime: '10:00',
  endTime: '11:00',
  isAllDay: false,
  ...over,
})

describe('inferEventDestination', () => {
  it('同じ名前のアプリの予定があればアプリ（その予定のリスト）', () => {
    expect(inferEventDestination('移動', [appEvent('移動')], [], [])).toEqual({ kind: 'app', listId: 'work' })
  })

  it('同じ名前の Google の予定があれば Google', () => {
    expect(inferEventDestination('ゼミ', [], [gEvent('ゼミ')], [])).toEqual({ kind: 'google' })
  })

  it('全角半角・大文字小文字・空白の違いは同じ名前、部分一致はしない', () => {
    expect(inferEventDestination(' ｍｔｇ ', [], [gEvent('MTG')], [])).toEqual({ kind: 'google' })
    expect(inferEventDestination('移動', [appEvent('新宿へ移動')], [gEvent('移動する')], [])).toBeNull()
  })

  it('分からない名前・空の名前は null', () => {
    expect(inferEventDestination('面接', [appEvent('移動')], [gEvent('ゼミ')], [])).toBeNull()
    expect(inferEventDestination('  ', [appEvent('')], [], [])).toBeNull()
  })

  it('両方あれば日付の新しいほう（同じなら作った時刻、同じ日時ならアプリ）', () => {
    const tasks = [appEvent('バイト', { scheduledDate: '2026-10-11' })]
    expect(inferEventDestination('バイト', tasks, [gEvent('バイト', { date: '2026-10-12' })], [])).toEqual({ kind: 'google' })
    expect(inferEventDestination('バイト', tasks, [gEvent('バイト', { date: '2026-10-10' })], [])).toEqual({ kind: 'app', listId: 'work' })
    expect(inferEventDestination('バイト', tasks, [gEvent('バイト', { date: '2026-10-11' })], [])).toEqual({ kind: 'app', listId: 'work' })
    const two = [
      appEvent('バイト', { listId: 'a', createdAt: '2026-10-01T00:00:00Z' }),
      appEvent('バイト', { listId: 'b', createdAt: '2026-10-02T00:00:00Z' }),
    ]
    expect(inferEventDestination('バイト', two, [], [])).toEqual({ kind: 'app', listId: 'b' })
  })

  it('ゴミ箱の予定・To-Do・アプリから送った Google の予定は数えない', () => {
    const tasks = [appEvent('移動', { deletedAt: '2026-10-11T00:00:00Z' }), appEvent('移動', { kind: 'todo' })]
    expect(inferEventDestination('移動', tasks, [], [])).toBeNull()
    expect(inferEventDestination('移動', [], [gEvent('移動', { id: googleEventIdForTask('x') })], [])).toBeNull()
  })

  it('送らない名前はアプリだけ（Google の予定があっても）', () => {
    expect(inferEventDestination('移動', [], [gEvent('移動')], ['移動'])).toEqual({ kind: 'app', listId: null })
    expect(inferEventDestination('移動', [appEvent('移動')], [gEvent('移動', { date: '2026-12-01' })], ['移動'])).toEqual({
      kind: 'app',
      listId: 'work',
    })
  })
})
