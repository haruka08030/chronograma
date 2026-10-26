import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { HOUR_HEIGHT } from './timeGrid'
import { deviceTimeZone, setAppTimeZoneSetting } from './timeZone'
import {
  durationMinutesForTaskSlot,
  isOvernightTimeLog,
  logOverlapsDateKey,
  logSegmentClockOnDay,
  minutesOfLogOnCalendarDay,
  patchAfterLogResize,
  patchAfterTimelineMove,
  timeLogSegmentLayoutForDay,
} from './taskTimeRange'

/**
 * 端末の夏時間が切り替わる日（2026-11-01 は 25 時間、2027-03-14 は 23 時間）でも、記録は壁時計どおりに数える。
 * 端末の Date で数えると、その日の 0 時からの位置と長さが 1 時間ずれていた。
 * Node は実行中に TZ を替えると Date の端末のタイムゾーンも替わる
 */
beforeAll(() => {
  vi.stubEnv('TZ', 'America/Los_Angeles')
})
afterAll(() => {
  setAppTimeZoneSetting(null)
  vi.unstubAllEnvs()
})

const log = (over: Partial<Task>): Task =>
  ({
    ...TASK_DEFAULTS,
    id: 'l',
    title: 'レポート',
    description: '',
    completed: true,
    completedAt: null,
    createdAt: '2026-10-05T00:00:00Z',
    updatedAt: '2026-10-05T00:00:00Z',
    order: 0,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    kind: 'log',
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  }) as Task

for (const app of [null, 'Asia/Tokyo'] as const) {
  describe(`端末 Los Angeles・アプリ ${app ?? '端末と同じ'}`, () => {
    beforeAll(() => setAppTimeZoneSetting(app))

    it('端末のタイムゾーンが Los Angeles になっている', () => {
      expect(deviceTimeZone()).toBe('America/Los_Angeles')
    })

    for (const day of ['2026-11-01', '2027-03-14']) {
      describe(day, () => {
        it('09:00–10:00 の記録は 9 時の位置に 60 分で出る', () => {
          const t = log({ dueDate: day, startTime: '09:00', endTime: '10:00' })
          expect(timeLogSegmentLayoutForDay(t, day)).toEqual({ top: 9 * HOUR_HEIGHT, height: HOUR_HEIGHT, span: HOUR_HEIGHT })
          expect(logSegmentClockOnDay(t, day)).toEqual({ startTime: '09:00', endTime: '10:00' })
          expect(minutesOfLogOnCalendarDay(t, day)).toBe(60)
          expect(durationMinutesForTaskSlot(t)).toBe(60)
        })

        it('00:10–02:10 の記録は 120 分', () => {
          const t = log({ dueDate: day, startTime: '00:10', endTime: '02:10' })
          expect(minutesOfLogOnCalendarDay(t, day)).toBe(120)
          expect(durationMinutesForTaskSlot(t)).toBe(120)
          expect(timeLogSegmentLayoutForDay(t, day)?.height).toBe(2 * HOUR_HEIGHT)
        })

        it('端を引くと、引いた時刻のまま保存する', () => {
          const t = log({ dueDate: day, startTime: '09:00', endTime: '10:00' })
          expect(patchAfterLogResize(t, day, '09:00', '11:00')).toEqual({
            dueDate: day,
            startTime: '09:00',
            endTime: '11:00',
            endDate: null,
          })
        })

        it('前の日の 23:00 から 01:00 までの記録は、その日に 60 分', () => {
          const prev = day === '2026-11-01' ? '2026-10-31' : '2027-03-13'
          const t = log({ dueDate: prev, endDate: day, startTime: '23:00', endTime: '01:00' })
          expect(isOvernightTimeLog(t)).toBe(true)
          expect(logOverlapsDateKey(t, day)).toBe(true)
          expect(minutesOfLogOnCalendarDay(t, prev)).toBe(60)
          expect(minutesOfLogOnCalendarDay(t, day)).toBe(60)
          expect(logSegmentClockOnDay(t, day)).toEqual({ startTime: '00:00', endTime: '01:00' })
          expect(durationMinutesForTaskSlot(t)).toBe(120)
        })

        it('記録を 01:30 へ動かすと長さを保って 01:30–02:30', () => {
          const t = log({ dueDate: day, startTime: '09:00', endTime: '10:00' })
          expect(patchAfterTimelineMove(t, day, '01:30', '02:30')).toEqual({
            dueDate: day,
            startTime: '01:30',
            endTime: '02:30',
            endDate: null,
          })
        })
      })
    }
  })
}
