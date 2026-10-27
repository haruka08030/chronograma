import { afterEach, describe, expect, it } from 'vitest'
import { habitFromRow, hasDayNumbers, logMinutesOnDay, previousDay, wrapUpDigest, wrapUpRowFilter, type WrapUpRow } from './wrapUp'
import { getDayReviews } from '../../../src/lib/weekReview'
import { setAppTimeZoneSetting } from '../../../src/lib/timeZone'
import { fromDateKey } from '../../../src/lib/dateKey'
import {
  EXAMPLE_DAY,
  EXAMPLE_EXCLUDED,
  EXAMPLE_RESULT,
  exampleHabit,
  exampleHabits,
  exampleTasks,
  toWrapUpHabitRow,
  toWrapUpRow,
} from '../../../src/test/dayResultExample'

const DAY = EXAMPLE_DAY
const TZ = 'Asia/Tokyo'

afterEach(() => setAppTimeZoneSetting(null))

describe('logMinutesOnDay', () => {
  const log = (p: Partial<WrapUpRow>): WrapUpRow => ({ id: 'l', list_id: 'inbox', is_time_log: true, ...p })

  it('その日の中の記録はその長さ', () => {
    expect(logMinutesOnDay(log({ due_date: DAY, start_time: '09:00', end_time: '10:30' }), DAY)).toBe(90)
  })

  it('前の日の夜から続く記録は、その日の分だけ（終わりが始まり以前なら翌日まで）', () => {
    const night = log({ due_date: '2026-10-07', start_time: '23:00', end_time: '01:30' })
    expect(logMinutesOnDay(night, DAY)).toBe(90)
    expect(logMinutesOnDay(night, '2026-10-07')).toBe(60)
  })

  it('終わりの日があって終わりが始まり以前なら数えない。時刻の無い記録も 0', () => {
    expect(logMinutesOnDay(log({ due_date: DAY, end_date: DAY, start_time: '10:00', end_time: '09:00' }), DAY)).toBe(0)
    expect(logMinutesOnDay(log({ due_date: DAY, start_time: null, end_time: null }), DAY)).toBe(0)
  })
})

describe('wrapUpDigest', () => {
  const rows = () => exampleTasks().map(toWrapUpRow)
  const habitRows = () => exampleHabits().map(toWrapUpHabitRow)

  it('予定 N 件中 M 件・予定外・記録を、今日の計画の見出し・週のふりかえり（getDayReviews）と同じ数にする', () => {
    setAppTimeZoneSetting(TZ)
    // 過ぎた日として（次の日の朝）
    const server = wrapUpDigest(rows(), habitRows(), DAY, { date: '2026-10-09', minutes: 8 * 60 }, EXAMPLE_EXCLUDED)
    const [app] = getDayReviews(exampleTasks(), exampleHabits(), [fromDateKey(DAY)], EXAMPLE_EXCLUDED, new Date(2026, 9, 9, 8, 0))
    expect(server).toEqual({
      planned: app!.timedPlanned,
      followed: app!.followed,
      unplannedMinutes: app!.unplannedMinutes,
      loggedMinutes: app!.loggedMinutes,
    })
    expect(server).toEqual(EXAMPLE_RESULT)
  })

  it('今日は、まだ終わっていない予定を数えない（先に記録できたものは数える）', () => {
    setAppTimeZoneSetting(TZ)
    // 20:30: read（20:00–21:00）はまだ終わっていない
    const server = wrapUpDigest(rows(), habitRows(), DAY, { date: DAY, minutes: 20 * 60 + 30 }, EXAMPLE_EXCLUDED)
    const [app] = getDayReviews(exampleTasks(), exampleHabits(), [fromDateKey(DAY)], EXAMPLE_EXCLUDED, new Date(2026, 9, 8, 20, 30))
    expect(server.planned).toBe(4)
    expect(server.followed).toBe(3)
    expect({ planned: app!.timedPlanned, followed: app!.followed }).toEqual({ planned: server.planned, followed: server.followed })
  })

  it('習慣につながった記録をゴミ箱に入れた日は、チェックしていても週に◯回の習慣の枠を数えない', () => {
    const habit = toWrapUpHabitRow(
      exampleHabit('swim', {
        timeMode: 'range',
        startTime: '09:00',
        endTime: '10:00',
        frequency: { type: 'timesPerWeek', count: 2 },
        completedDates: [DAY],
      }),
    )
    const trashed: WrapUpRow = {
      id: 'swimLog',
      list_id: 'inbox',
      title: 'swim',
      is_time_log: true,
      habit_id: 'swim',
      due_date: DAY,
      start_time: '09:00',
      end_time: '10:00',
      deleted_at: '2026-10-08T05:00:00Z',
    }
    const past = { date: '2026-10-09', minutes: 0 }
    expect(wrapUpDigest([trashed], [habit], DAY, past).planned).toBe(0)
    expect(wrapUpDigest([{ ...trashed, deleted_at: null }], [habit], DAY, past)).toMatchObject({ planned: 1, followed: 1 })
  })

  it('アーカイブ・ゴミ箱の習慣はやめた日より前だけ数える（やめた日の無い古い行はどの日も数えない）', () => {
    const row = { id: 'h', time_mode: 'fixed', start_time: '07:00', end_time: '07:30', frequency: { type: 'daily' } }
    const past = { date: '2026-10-20', minutes: 0 }
    const planned = (r: object) => wrapUpDigest([], [{ ...row, ...r }], DAY, past).planned
    expect(planned({})).toBe(1)
    expect(planned({ deleted_at: '2026-10-12T00:00:00Z', ended_on: '2026-10-12' })).toBe(1)
    expect(planned({ archived_at: '2026-10-10T00:00:00Z', ended_on: DAY })).toBe(0)
    expect(planned({ archived_at: '2026-10-10T00:00:00Z' })).toBe(0)
    expect(planned({ ended_on: '2026-10-01' })).toBe(1)
  })

  it('習慣の行の読めない値は既定にする', () => {
    expect(
      habitFromRow({ id: 'h', frequency: { type: 'weird' }, completed_dates: 'x', time_mode: null, start_time: '07:00' }),
    ).toMatchObject({
      frequency: { type: 'daily' },
      completedDates: [],
      timeMode: 'fixed',
    })
  })
})

describe('wrapUpRowFilter', () => {
  it('その日に置いたもの、前の日・次の日の記録、その日に終わる記録を選ぶ', () => {
    expect(wrapUpRowFilter(DAY).split(',')).toEqual([
      'scheduled_date.eq.2026-10-08',
      'due_date.eq.2026-10-08',
      'due_date.eq.2026-10-07',
      'due_date.eq.2026-10-09',
      'end_date.eq.2026-10-08',
    ])
  })
})

describe('previousDay / hasDayNumbers（#278 朝のまとめの昨日）', () => {
  it('前の日（月・年・うるう年の境目も）', () => {
    expect(previousDay(DAY)).toBe('2026-10-07')
    expect(previousDay('2026-10-01')).toBe('2026-09-30')
    expect(previousDay('2027-01-01')).toBe('2026-12-31')
    expect(previousDay('2028-03-01')).toBe('2028-02-29')
  })

  it('数えた予定か記録があれば数字がある日', () => {
    const none = { planned: 0, followed: 0, unplannedMinutes: 0, loggedMinutes: 0 }
    expect(hasDayNumbers(none)).toBe(false)
    expect(hasDayNumbers({ ...none, planned: 1 })).toBe(true)
    expect(hasDayNumbers({ ...none, loggedMinutes: 5 })).toBe(true)
  })
})
