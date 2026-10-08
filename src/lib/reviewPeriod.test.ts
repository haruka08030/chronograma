import { describe, expect, it } from 'vitest'
import { toDateKey } from './dateKey'
import { monthHabitWeekStarts, reviewPeriodDays, reviewPeriodStart, shiftReviewPeriod } from './reviewPeriod'

const d = (key: string) => new Date(`${key}T12:00:00`)
const keys = (ds: Date[]) => ds.map(toDateKey)

describe('reviewPeriod', () => {
  it('週は月曜はじまりの 7 日、月は 1 日から末日まで', () => {
    expect(toDateKey(reviewPeriodStart('week', d('2026-10-03')))).toBe('2026-09-28')
    const week = keys(reviewPeriodDays('week', d('2026-10-03')))
    expect([week[0], week[6], week.length]).toEqual(['2026-09-28', '2026-10-04', 7])
    const oct = keys(reviewPeriodDays('month', d('2026-10-03')))
    expect([oct[0], oct[oct.length - 1], oct.length]).toEqual(['2026-10-01', '2026-10-31', 31])
    expect(reviewPeriodDays('month', d('2028-02-10'))).toHaveLength(29)
  })

  it('月をずらすと日は末日に丸める（3/31 の 1 か月前は 2/28）', () => {
    expect(toDateKey(shiftReviewPeriod('month', d('2026-03-31'), -1))).toBe('2026-02-28')
    expect(toDateKey(shiftReviewPeriod('week', d('2026-10-03'), -1))).toBe('2026-09-26')
  })

  it('月の「週に◯回」は 4 日以上がその月にある週（木曜がその月）だけ', () => {
    // 2026-10-01 は木曜: 9/28 の週は 10 月、11/2 の週は 11 月
    expect(keys(monthHabitWeekStarts(d('2026-10-15')))).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
    // 9 月: 8/31 の週（木曜 9/3）から 9/21 の週まで。9/28 の週は 10 月に入る
    expect(keys(monthHabitWeekStarts(d('2026-09-15')))).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'])
  })
})
