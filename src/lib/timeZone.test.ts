import { afterEach, describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import {
  convertWall,
  fromAppWall,
  gmtLabel,
  instantFromWall,
  setAppTimeZoneSetting,
  toAppWall,
  wallInZone,
  zoneOffsetMinutes,
} from './timeZone'
import { convertTaskTimes, reanchorTask, timesPatchFromZone } from './taskTimeZone'
import { TASK_DEFAULTS } from './taskDefaults'

afterEach(() => setAppTimeZoneSetting(null))

describe('timeZone', () => {
  it('reads offsets, including half hours and daylight saving', () => {
    expect(zoneOffsetMinutes('Asia/Tokyo', Date.UTC(2026, 0, 1))).toBe(540)
    expect(zoneOffsetMinutes('Asia/Kolkata', Date.UTC(2026, 0, 1))).toBe(330)
    expect(zoneOffsetMinutes('America/New_York', Date.UTC(2026, 0, 15))).toBe(-300)
    expect(zoneOffsetMinutes('America/New_York', Date.UTC(2026, 6, 15))).toBe(-240)
    expect(gmtLabel('Asia/Kolkata', Date.UTC(2026, 0, 1))).toBe('GMT+5:30')
    expect(gmtLabel('America/New_York', Date.UTC(2026, 6, 15))).toBe('GMT-4')
  })

  it('round-trips wall clock and instant', () => {
    const at = instantFromWall('2026-10-05', '09:30', 'Asia/Tokyo')
    expect(new Date(at).toISOString()).toBe('2026-10-05T00:30:00.000Z')
    expect(wallInZone(at, 'Asia/Tokyo')).toEqual({ date: '2026-10-05', time: '09:30' })
    expect(wallInZone(at, 'America/New_York')).toEqual({ date: '2026-10-04', time: '20:30' })
  })

  it('converts wall clock between zones across the date line', () => {
    expect(convertWall('2026-10-05', '10:00', 'America/New_York', 'Asia/Tokyo')).toEqual({ date: '2026-10-05', time: '23:00' })
    expect(convertWall('2026-10-05', '20:00', 'America/New_York', 'Asia/Tokyo')).toEqual({ date: '2026-10-06', time: '09:00' })
  })

  it('shifts "now" so local getters read the app zone', () => {
    const at = Date.UTC(2026, 9, 5, 0, 30)
    setAppTimeZoneSetting('America/New_York')
    const wall = toAppWall(at)
    expect([wall.getDate(), wall.getHours(), wall.getMinutes()]).toEqual([4, 20, 30])
    expect(fromAppWall(wall).getTime()).toBe(at)
  })
})

const base: Task = {
  ...TASK_DEFAULTS,
  id: 't',
  title: 't',
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
}

describe('taskTimeZone', () => {
  it('converts a plan, crossing midnight into an end date', () => {
    const plan = { ...base, scheduledDate: '2026-10-05', startTime: '10:00', endTime: '11:00' }
    const out = convertTaskTimes(plan, 'America/New_York', 'Asia/Tokyo')
    expect(out).toMatchObject({ scheduledDate: '2026-10-05', startTime: '23:00', endTime: '00:00', endDate: '2026-10-06' })
    expect(convertTaskTimes(out, 'Asia/Tokyo', 'America/New_York')).toMatchObject({
      scheduledDate: '2026-10-05',
      startTime: '10:00',
      endTime: '11:00',
      endDate: null,
    })
  })

  it('converts a deadline time and leaves date-only deadlines alone', () => {
    const t = { ...base, dueDate: '2026-10-05', dueTime: '17:00' }
    expect(convertTaskTimes(t, 'America/New_York', 'Asia/Tokyo')).toMatchObject({ dueDate: '2026-10-06', dueTime: '06:00' })
    const dateOnly = { ...base, dueDate: '2026-10-05' }
    expect(convertTaskTimes(dateOnly, 'America/New_York', 'Asia/Tokyo').dueDate).toBe('2026-10-05')
  })

  it('converts an overnight record', () => {
    const log = { ...base, kind: 'log' as const, dueDate: '2026-10-05', startTime: '23:00', endTime: '01:00' }
    expect(convertTaskTimes(log, 'Asia/Tokyo', 'Europe/London')).toMatchObject({
      dueDate: '2026-10-05',
      startTime: '15:00',
      endTime: '17:00',
      endDate: null,
    })
  })

  it('re-anchors zoned tasks to the app zone and keeps the instant', () => {
    const t = {
      ...base,
      scheduledDate: '2026-10-05',
      startTime: '23:00',
      endTime: '23:30',
      timeZone: 'America/New_York',
      timeZoneAnchor: 'Asia/Tokyo',
    }
    const r = reanchorTask(t, 'America/New_York')
    expect(r).toMatchObject({ startTime: '10:00', endTime: '10:30', timeZoneAnchor: 'America/New_York' })
    expect(reanchorTask(r, 'America/New_York')).toBe(r)
  })

  it('タイムゾーンを決めていない予定も、アプリのタイムゾーンを変えたら同じ瞬間のままずらす（Google と同じ）', () => {
    const gym = { ...base, scheduledDate: '2026-10-05', startTime: '07:00', endTime: '08:00', timeZoneAnchor: 'Asia/Tokyo' }
    expect(reanchorTask(gym, 'America/New_York')).toMatchObject({
      scheduledDate: '2026-10-04',
      startTime: '18:00',
      endTime: '19:00',
      timeZoneAnchor: 'America/New_York',
    })
  })

  it('書いたタイムゾーンが分からない古いものは、いまのタイムゾーンで書いたとみなす（時刻は動かさない）', () => {
    const old = { ...base, scheduledDate: '2026-10-05', startTime: '09:00', endTime: '10:00' }
    expect(reanchorTask(old, 'Asia/Tokyo')).toMatchObject({ startTime: '09:00', timeZoneAnchor: 'Asia/Tokyo' })
  })

  it('日付だけのタスクは動かない', () => {
    const due = { ...base, dueDate: '2026-10-05', timeZoneAnchor: 'Asia/Tokyo' }
    expect(reanchorTask(due, 'America/New_York')).toMatchObject({ dueDate: '2026-10-05' })
  })
})

describe('タイムゾーンの違う 2 台の同期', () => {
  it('同じ瞬間なら、相手の書き方の行をこちらに直すと手元の行と同じになる（送らなくてよい）', () => {
    const tokyo = {
      ...base,
      scheduledDate: '2026-10-05',
      startTime: '07:00',
      endTime: '08:00',
      endDate: null,
      timeZoneAnchor: 'Asia/Tokyo',
    } as Task
    const newYork = reanchorTask(tokyo, 'America/New_York')
    expect(newYork).toMatchObject({ scheduledDate: '2026-10-04', startTime: '18:00', timeZoneAnchor: 'America/New_York' })
    expect(reanchorTask(newYork, 'Asia/Tokyo')).toEqual(tokyo)
  })
})

describe('timesPatchFromZone', () => {
  it('edits a zoned plan in its own zone and writes app-zone columns', () => {
    setAppTimeZoneSetting('Asia/Tokyo')
    // New York 10:00–11:00 is Tokyo 23:00–00:00 (next day)
    const view = { ...base, scheduledDate: '2026-10-05', startTime: '10:00', endTime: '11:00', endDate: null }
    expect(timesPatchFromZone(view, { endTime: '10:30' }, 'America/New_York')).toMatchObject({
      scheduledDate: '2026-10-05',
      startTime: '23:00',
      endTime: '23:30',
      endDate: null,
    })
    // a view that crossed midnight must not keep its stale end date after the end time changes
    const crossing = { ...base, scheduledDate: '2026-10-05', startTime: '23:00', endTime: '00:30', endDate: '2026-10-06' }
    expect(timesPatchFromZone(crossing, { endTime: '23:30' }, 'Asia/Tokyo')).toMatchObject({ endTime: '23:30', endDate: null })
  })
})
