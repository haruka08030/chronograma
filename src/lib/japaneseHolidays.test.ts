import { describe, expect, it } from 'vitest'
import { autumnalEquinoxDay, japaneseHolidayName, japaneseHolidaysOf, vernalEquinoxDay } from './japaneseHolidays'

/** その年の祝日を「日付 名前」の一覧に */
function listOf(y: number): string[] {
  return [...japaneseHolidaysOf(y)].map(([k, name]) => `${k} ${name}`)
}

describe('japaneseHolidaysOf: 内閣府の祝日一覧と同じ', () => {
  it('2026 年（憲法記念日が日曜 → 5/6 振替休日、9/22 国民の休日）', () => {
    expect(listOf(2026)).toEqual([
      '2026-01-01 元日',
      '2026-01-12 成人の日',
      '2026-02-11 建国記念の日',
      '2026-02-23 天皇誕生日',
      '2026-03-20 春分の日',
      '2026-04-29 昭和の日',
      '2026-05-03 憲法記念日',
      '2026-05-04 みどりの日',
      '2026-05-05 こどもの日',
      '2026-05-06 振替休日',
      '2026-07-20 海の日',
      '2026-08-11 山の日',
      '2026-09-21 敬老の日',
      '2026-09-22 国民の休日',
      '2026-09-23 秋分の日',
      '2026-10-12 スポーツの日',
      '2026-11-03 文化の日',
      '2026-11-23 勤労感謝の日',
    ])
  })

  it('2025 年（天皇誕生日・みどりの日・勤労感謝の日が日曜 → 振替休日）', () => {
    expect(listOf(2025)).toEqual([
      '2025-01-01 元日',
      '2025-01-13 成人の日',
      '2025-02-11 建国記念の日',
      '2025-02-23 天皇誕生日',
      '2025-02-24 振替休日',
      '2025-03-20 春分の日',
      '2025-04-29 昭和の日',
      '2025-05-03 憲法記念日',
      '2025-05-04 みどりの日',
      '2025-05-05 こどもの日',
      '2025-05-06 振替休日',
      '2025-07-21 海の日',
      '2025-08-11 山の日',
      '2025-09-15 敬老の日',
      '2025-09-23 秋分の日',
      '2025-10-13 スポーツの日',
      '2025-11-03 文化の日',
      '2025-11-23 勤労感謝の日',
      '2025-11-24 振替休日',
    ])
  })

  it('2019 年（即位の日・即位礼正殿の儀と、その前後の国民の休日。天皇誕生日は無し）', () => {
    expect(listOf(2019)).toEqual([
      '2019-01-01 元日',
      '2019-01-14 成人の日',
      '2019-02-11 建国記念の日',
      '2019-03-21 春分の日',
      '2019-04-29 昭和の日',
      '2019-04-30 国民の休日',
      '2019-05-01 天皇の即位の日',
      '2019-05-02 国民の休日',
      '2019-05-03 憲法記念日',
      '2019-05-04 みどりの日',
      '2019-05-05 こどもの日',
      '2019-05-06 振替休日',
      '2019-07-15 海の日',
      '2019-08-11 山の日',
      '2019-08-12 振替休日',
      '2019-09-16 敬老の日',
      '2019-09-23 秋分の日',
      '2019-10-14 体育の日',
      '2019-10-22 即位礼正殿の儀',
      '2019-11-03 文化の日',
      '2019-11-04 振替休日',
      '2019-11-23 勤労感謝の日',
    ])
  })

  it('2020・2021 年はオリンピックで海の日・スポーツの日・山の日が動いた', () => {
    expect(japaneseHolidayName('2020-07-23')).toBe('海の日')
    expect(japaneseHolidayName('2020-07-24')).toBe('スポーツの日')
    expect(japaneseHolidayName('2020-08-10')).toBe('山の日')
    expect(japaneseHolidayName('2020-10-12')).toBeNull()
    expect(japaneseHolidayName('2021-07-22')).toBe('海の日')
    expect(japaneseHolidayName('2021-07-23')).toBe('スポーツの日')
    expect(japaneseHolidayName('2021-08-08')).toBe('山の日')
    expect(japaneseHolidayName('2021-08-09')).toBe('振替休日')
    expect(japaneseHolidayName('2021-07-19')).toBeNull()
  })

  it('法改正の前の年: ハッピーマンデーの前・4/29 がみどりの日・12/23 が天皇誕生日', () => {
    expect(japaneseHolidayName('2001-07-20')).toBe('海の日')
    expect(japaneseHolidayName('2002-09-15')).toBe('敬老の日')
    expect(japaneseHolidayName('2002-09-16')).toBe('振替休日')
    expect(japaneseHolidayName('2006-04-29')).toBe('みどりの日')
    // 2006 年までの 5/4 は「国民の休日」
    expect(japaneseHolidayName('2006-05-04')).toBe('国民の休日')
    expect(japaneseHolidayName('2018-12-23')).toBe('天皇誕生日')
    expect(japaneseHolidayName('2018-12-24')).toBe('振替休日')
    expect(japaneseHolidayName('2015-08-11')).toBeNull()
  })

  it('2007 年からの振替休日は、祝日の続く日を飛ばして次の平日へ', () => {
    // 2008/5/4（みどりの日）が日曜 → 5/5 こどもの日の次の 5/6
    expect(japaneseHolidayName('2008-05-06')).toBe('振替休日')
    expect(japaneseHolidayName('2009-09-22')).toBe('国民の休日')
    expect(japaneseHolidayName('2015-09-22')).toBe('国民の休日')
    expect(japaneseHolidayName('2032-09-21')).toBe('国民の休日')
  })

  it('春分・秋分の日の近似式', () => {
    expect([2023, 2024, 2025, 2026, 2030].map(vernalEquinoxDay)).toEqual([21, 20, 20, 20, 20])
    expect([2012, 2023, 2024, 2025, 2026].map(autumnalEquinoxDay)).toEqual([22, 23, 22, 23, 23])
  })

  it('平日・範囲外は null', () => {
    expect(japaneseHolidayName('2026-10-08')).toBeNull()
    expect(japaneseHolidayName('1999-01-01')).toBeNull()
    expect(japaneseHolidayName('2100-01-01')).toBeNull()
  })

  it('どの年も 15〜22 日、日曜に「国民の休日」は来ない', () => {
    for (let y = 2000; y <= 2099; y++) {
      const all = japaneseHolidaysOf(y)
      expect(all.size).toBeGreaterThanOrEqual(15)
      expect(all.size).toBeLessThanOrEqual(22)
      for (const [k, name] of all) {
        if (name === '国民の休日' || name === '振替休日') expect(new Date(`${k}T12:00:00Z`).getUTCDay()).not.toBe(0)
      }
    }
  })
})
