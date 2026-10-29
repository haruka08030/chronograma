import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'

vi.mock('./timeZone', async (orig) => ({ ...(await orig<typeof import('./timeZone')>()), appTimeZone: () => 'Asia/Tokyo' }))

const {
  changedForGoogle,
  changedForGoogleSkip,
  shouldBeOnGoogle,
  googleColorIdForHex,
  googleEventIdForTask,
  googleFieldsForTask,
  isPushedGoogleEvent,
  taskIdForGoogleEventId,
} = await import('./googlePush')

const event = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    kind: 'event',
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
    scheduledDate: '2026-10-14',
    startTime: '10:00',
    endTime: '11:30',
    endDate: null,
    timeZone: null,
    timeZoneAnchor: null,
    color: null,
    archivedAt: null,
    deletedAt: null,
    ...over,
  }) as Task

describe('googleEventIdForTask', () => {
  it('Google の ID に使える文字だけで、同じ予定はいつも同じ ID', () => {
    const id = googleEventIdForTask('8f14e45f-ceea-467a-9575-6d5f1c2f6a3b')
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/)
    expect(id).toBe(googleEventIdForTask('8f14e45f-ceea-467a-9575-6d5f1c2f6a3b'))
    expect(isPushedGoogleEvent({ id })).toBe(true)
    expect(isPushedGoogleEvent({ id: `${id}_20261014T010000Z` })).toBe(true)
    expect(isPushedGoogleEvent({ id: 'abc123def456' })).toBe(false)
  })

  it('Google の ID からアプリの予定の ID に戻せる（アプリから作ったものでなければ null）', () => {
    const taskId = '8f14e45f-ceea-467a-9575-6d5f1c2f6a3b'
    expect(taskIdForGoogleEventId(googleEventIdForTask(taskId))).toBe(taskId)
    expect(taskIdForGoogleEventId('abc123def456')).toBeNull()
    expect(taskIdForGoogleEventId('chronograma')).toBeNull()
    expect(taskIdForGoogleEventId('chronograma6')).toBeNull()
  })
})

describe('googleColorIdForHex', () => {
  it('Google の 11 色はそのまま、ほかは一番近い色、色なしは null', () => {
    expect(googleColorIdForHex('#039BE5')).toBe('7')
    expect(googleColorIdForHex('#d50000')).toBe('11')
    expect(googleColorIdForHex('#009688')).not.toBeNull()
    expect(googleColorIdForHex(null)).toBeNull()
    expect(googleColorIdForHex('#9E9E9E')).toBeNull()
  })
})

describe('googleFieldsForTask', () => {
  it('時刻のある予定はアプリのタイムゾーンの時刻で送る', () => {
    const f = googleFieldsForTask(event('a', { title: 'ゼミ', description: 'メモ', color: '#E67C73' }))
    expect(f).toEqual({
      summary: 'ゼミ',
      description: 'メモ',
      colorId: '4',
      start: { dateTime: '2026-10-14T10:00:00', timeZone: 'Asia/Tokyo' },
      end: { dateTime: '2026-10-14T11:30:00', timeZone: 'Asia/Tokyo' },
    })
  })

  it('日をまたぐ予定は翌日に終わる', () => {
    const f = googleFieldsForTask(event('a', { startTime: '22:00', endTime: '02:00' }))
    expect(f.end).toEqual({ dateTime: '2026-10-15T02:00:00', timeZone: 'Asia/Tokyo' })
  })

  it('終日の予定は終わりの日を含まない形で送る', () => {
    const f = googleFieldsForTask(event('a', { startTime: null, endTime: null, endDate: '2026-10-16' }))
    expect(f.start).toEqual({ date: '2026-10-14' })
    expect(f.end).toEqual({ date: '2026-10-17' })
  })

  it('タイムゾーンを決めた予定は、そのタイムゾーンの時刻で送る', () => {
    const f = googleFieldsForTask(event('a', { timeZone: 'America/New_York', timeZoneAnchor: 'Asia/Tokyo' }))
    expect(f.start).toEqual({ dateTime: '2026-10-13T21:00:00', timeZone: 'America/New_York' })
  })
})

describe('changedForGoogle', () => {
  it('作る・直す・ゴミ箱・完全に消すを拾い、To-Do や関係ない変更は拾わない', () => {
    const a = event('a')
    const b = event('b')
    const todo = event('t', { kind: 'todo' })
    const prev = [a, b, todo]
    expect(changedForGoogle(prev, [...prev, event('c')])).toEqual(['c'])
    expect(changedForGoogle(prev, [{ ...a, title: '新しい名前' }, b, todo])).toEqual(['a'])
    expect(changedForGoogle(prev, [{ ...a, color: '#D50000' }, b, todo])).toEqual(['a'])
    expect(changedForGoogle(prev, [{ ...a, deletedAt: '2026-10-14T00:00:00Z' }, b, todo])).toEqual(['a'])
    expect(changedForGoogle(prev, [b, todo])).toEqual(['a'])
    expect(changedForGoogle(prev, [{ ...a, order: 5 }, b, { ...todo, title: 'x' }])).toEqual([])
    // To-Do を予定にしても、新しく Google には作らない（#626）
    expect(changedForGoogle(prev, [a, b, { ...todo, kind: 'event' } as Task])).toEqual([])
    expect(changedForGoogle(prev, [{ ...a, kind: 'todo' } as Task, b, todo])).toEqual(['a'])
  })

  it('アプリのタイムゾーンを変えて書き直しただけ（同じ瞬間）では送らない', () => {
    const a = event('a', { timeZoneAnchor: 'Asia/Tokyo' })
    const moved = { ...a, scheduledDate: '2026-10-13', startTime: '21:00', endTime: '22:30', timeZoneAnchor: 'America/New_York' }
    expect(changedForGoogle([a], [moved])).toEqual([])
  })
})

describe('送るのは前に作った予定だけ（#626）', () => {
  const NEW = '2026-10-27T00:00:00+09:00'

  it('GOOGLE_PUSH_UNTIL より後に作った予定は Google に置かない', () => {
    expect(shouldBeOnGoogle(event('a', { createdAt: '2026-10-26T14:59:59Z' }))).toBe(true)
    expect(shouldBeOnGoogle(event('a', { createdAt: NEW }))).toBe(false)
    expect(shouldBeOnGoogle(event('a', { createdAt: '2026-11-01T00:00:00Z' }))).toBe(false)
  })

  it('新しい予定は作っても直しても消しても送らず、前の予定は今までどおり直す・消す', () => {
    const fresh = event('n', { createdAt: NEW })
    const old = event('o')
    expect(changedForGoogle([old], [old, fresh])).toEqual([])
    expect(changedForGoogle([old, fresh], [old, { ...fresh, title: '移動' }])).toEqual([])
    expect(changedForGoogle([old, fresh], [old])).toEqual([])
    expect(changedForGoogle([old, fresh], [{ ...old, title: 'x' }, fresh])).toEqual(['o'])
    expect(changedForGoogle([old], [])).toEqual(['o'])
  })

  it('送らない名前を変えても新しい予定は送らない', () => {
    const fresh = event('n', { title: '移動', createdAt: NEW, scheduledDate: '2026-11-01' })
    expect(changedForGoogleSkip([fresh], new Set(['移動']), new Set(), '2026-10-27')).toEqual([])
  })
})

describe('送らない名前（#461）', () => {
  const skip = new Set(['移動'])

  it('送らない名前の予定は Google に置かない（全角半角・空白の違いは同じ名前）', () => {
    expect(shouldBeOnGoogle(event('a', { title: '移動' }), skip)).toBe(false)
    expect(shouldBeOnGoogle(event('a', { title: ' 移動 ' }), skip)).toBe(false)
    expect(shouldBeOnGoogle(event('a', { title: '新宿へ移動' }), skip)).toBe(true)
    expect(shouldBeOnGoogle(event('a', { title: '移動' }))).toBe(true)
  })

  it('名前を変えて送らない名前になれば消し、外れれば送る', () => {
    const a = event('a', { title: '電車' })
    expect(changedForGoogle([a], [{ ...a, title: '移動' }], skip)).toEqual(['a'])
    expect(changedForGoogle([{ ...a, title: '移動' }], [a], skip)).toEqual(['a'])
    // 送らない予定を直しても送らない
    const m = event('m', { title: '移動' })
    expect(changedForGoogle([m], [{ ...m, startTime: '09:00' }], skip)).toEqual([])
  })

  it('送らないにした名前は日を問わず消し、戻した名前は今日から先だけ送る', () => {
    const past = event('p', { title: '移動', scheduledDate: '2026-10-01' })
    const future = event('f', { title: '移動', scheduledDate: '2026-10-20' })
    const other = event('o', { title: '面接', scheduledDate: '2026-10-20' })
    const todo = event('t', { title: '移動', kind: 'todo' })
    const gone = event('g', { title: '移動', deletedAt: '2026-10-02T00:00:00Z' })
    const tasks = [past, future, other, todo, gone]
    expect(changedForGoogleSkip(tasks, new Set(), skip, '2026-10-19')).toEqual(['p', 'f'])
    expect(changedForGoogleSkip(tasks, skip, new Set(), '2026-10-19')).toEqual(['f'])
    expect(changedForGoogleSkip(tasks, skip, skip, '2026-10-19')).toEqual([])
  })
})
