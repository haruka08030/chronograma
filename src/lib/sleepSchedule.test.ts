import { describe, expect, it } from 'vitest'
import {
  commonSleepPlan,
  everyDaySleepSchedule,
  normalizeSleepSchedule,
  sameSleepPlan,
  sleepPlanOn,
  sleepSlotsOnDay,
} from './sleepSchedule'

describe('睡眠の予定（#652）', () => {
  // 2026-10-27 は火曜（ISO 2）
  const schedule = normalizeSleepSchedule({
    2: { bed: '23:30', wake: '07:00' },
    3: { bed: '01:00', wake: '09:00' },
    4: { bed: '1:00', wake: 'x' },
  })

  it('壊れた曜日は落とし、曜日は起きる日で引く', () => {
    expect(Object.keys(schedule)).toEqual(['2', '3'])
    expect(sleepPlanOn(schedule, '2026-10-27')).toEqual({ bed: '23:30', wake: '07:00' })
    expect(sleepPlanOn(schedule, '2026-10-26')).toBeNull()
  })

  it('その日の列には、その朝の睡眠（前の晩から）とその夜の睡眠の、この日にかかる区間', () => {
    // 月曜の列: 火曜の朝の睡眠が 23:30 から 24:00 まで
    expect(sleepSlotsOnDay(schedule, '2026-10-26').map((s) => [s.wakeDate, s.seg.startTime, s.seg.endTime])).toEqual([
      ['2026-10-27', '23:30', '24:00'],
    ])
    // 火曜の列: 0:00–7:00（火曜の朝）と、水曜の朝の 1:00–9:00 は水曜の列なので出ない
    expect(sleepSlotsOnDay(schedule, '2026-10-27').map((s) => [s.wakeDate, s.seg.startTime, s.seg.endTime])).toEqual([
      ['2026-10-27', '00:00', '07:00'],
    ])
    expect(sleepSlotsOnDay(schedule, '2026-10-28').map((s) => [s.wakeDate, s.seg.startTime, s.seg.endTime])).toEqual([
      ['2026-10-28', '01:00', '09:00'],
    ])
  })
})

describe('毎日同じ・曜日ごと（#659）', () => {
  const a = { bed: '23:30', wake: '07:00' }
  const b = { bed: '01:00', wake: '09:00' }
  it('7 日とも同じ時刻のときだけ 1 つの時刻', () => {
    expect(sameSleepPlan(everyDaySleepSchedule(a))).toEqual(a)
    expect(sameSleepPlan({ ...everyDaySleepSchedule(a), 7: b })).toBeNull()
    const six = everyDaySleepSchedule(a)
    delete six[3]
    expect(sameSleepPlan(six)).toBeNull()
    expect(sameSleepPlan({})).toBeNull()
  })
  it('まとめるときはいちばん多い時刻、同じ数なら月曜に近い曜日', () => {
    expect(commonSleepPlan({ ...everyDaySleepSchedule(a), 6: b, 7: b })).toEqual(a)
    expect(commonSleepPlan({ 2: b, 3: a })).toEqual(b)
    expect(commonSleepPlan({})).toBeNull()
  })
})
