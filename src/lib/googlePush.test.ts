import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'

vi.mock('./timeZone', async (orig) => ({ ...(await orig<typeof import('./timeZone')>()), appTimeZone: () => 'Asia/Tokyo' }))

const { changedForGoogle, googleColorIdForHex, googleEventIdForTask, googleFieldsForTask, isPushedGoogleEvent } =
  await import('./googlePush')

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
    expect(changedForGoogle(prev, [a, b, { ...todo, kind: 'event' } as Task])).toEqual(['t'])
    expect(changedForGoogle(prev, [{ ...a, kind: 'todo' } as Task, b, todo])).toEqual(['a'])
  })

  it('アプリのタイムゾーンを変えて書き直しただけ（同じ瞬間）では送らない', () => {
    const a = event('a', { timeZoneAnchor: 'Asia/Tokyo' })
    const moved = { ...a, scheduledDate: '2026-10-13', startTime: '21:00', endTime: '22:30', timeZoneAnchor: 'America/New_York' }
    expect(changedForGoogle([a], [moved])).toEqual([])
  })
})
