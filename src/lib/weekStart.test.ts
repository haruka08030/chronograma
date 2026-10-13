import { describe, expect, it } from 'vitest'
import { toDateKey } from './dateKey'
import {
  appWeekStartsOn,
  calendarWeekDays,
  calendarWeekEnd,
  calendarWeekStart,
  dayIndexInWeek,
  monthGridDays,
  normalizeWeekStart,
  setAppWeekStartSetting,
  weekdayLabelsFrom,
} from './weekStart'

const keys = (ds: Date[]) => ds.map(toDateKey)
// 2026/10/7 は水曜
const wed = new Date(2026, 9, 7)

describe('週の開始日', () => {
  it('既定は月曜。知らない値・項目なしも月曜', () => {
    expect(appWeekStartsOn()).toBe(1)
    expect(normalizeWeekStart(undefined)).toBe(1)
    expect(normalizeWeekStart(3)).toBe(1)
    expect(normalizeWeekStart('0')).toBe(1)
    expect(normalizeWeekStart(0)).toBe(0)
    expect(normalizeWeekStart(6)).toBe(6)
  })

  it('月曜はじまり: 10/5（月）〜10/11（日）', () => {
    expect(toDateKey(calendarWeekStart(wed, 1))).toBe('2026-10-05')
    expect(toDateKey(calendarWeekEnd(wed, 1))).toBe('2026-10-11')
    expect(keys(calendarWeekDays(wed, 1))).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ])
    expect(dayIndexInWeek(wed, 1)).toBe(2)
    expect(dayIndexInWeek(new Date(2026, 9, 11), 1)).toBe(6)
  })

  it('日曜はじまり: 10/4（日）〜10/10（土）。日曜はその週の頭', () => {
    expect(toDateKey(calendarWeekStart(wed, 0))).toBe('2026-10-04')
    expect(toDateKey(calendarWeekEnd(wed, 0))).toBe('2026-10-10')
    expect(toDateKey(calendarWeekStart(new Date(2026, 9, 11), 0))).toBe('2026-10-11')
    expect(dayIndexInWeek(wed, 0)).toBe(3)
    expect(dayIndexInWeek(new Date(2026, 9, 11), 0)).toBe(0)
  })

  it('土曜はじまり: 10/3（土）〜10/9（金）', () => {
    expect(keys(calendarWeekDays(wed, 6))[0]).toBe('2026-10-03')
    expect(keys(calendarWeekDays(wed, 6))[6]).toBe('2026-10-09')
    expect(dayIndexInWeek(new Date(2026, 9, 3), 6)).toBe(0)
  })

  it('月のカレンダー: 2026 年 10 月（1 日は木曜）', () => {
    const mon = keys(monthGridDays(new Date(2026, 9, 15), 1))
    expect([mon[0], mon[mon.length - 1], mon.length]).toEqual(['2026-09-28', '2026-11-01', 35])
    const sun = keys(monthGridDays(new Date(2026, 9, 15), 0))
    expect([sun[0], sun[sun.length - 1], sun.length]).toEqual(['2026-09-27', '2026-10-31', 35])
    const sat = keys(monthGridDays(new Date(2026, 9, 15), 6))
    expect([sat[0], sat[sat.length - 1], sat.length]).toEqual(['2026-09-26', '2026-11-06', 42])
  })

  it('曜日名を週の最初の日から並べ直す（月曜から並んだ名前を渡す）', () => {
    const ja = ['月', '火', '水', '木', '金', '土', '日']
    expect(weekdayLabelsFrom(ja, 1)).toEqual(ja)
    expect(weekdayLabelsFrom(ja, 0)).toEqual(['日', '月', '火', '水', '木', '金', '土'])
    expect(weekdayLabelsFrom(ja, 6)).toEqual(['土', '日', '月', '火', '水', '木', '金'])
  })

  it('引数を省くと設定の値を使う', () => {
    setAppWeekStartSetting(0)
    try {
      expect(toDateKey(calendarWeekStart(wed))).toBe('2026-10-04')
      expect(weekdayLabelsFrom(['M', 'T', 'W', 'T', 'F', 'S', 'S'])[0]).toBe('S')
    } finally {
      setAppWeekStartSetting(1)
    }
    expect(toDateKey(calendarWeekStart(wed))).toBe('2026-10-05')
  })
})
