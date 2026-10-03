import { describe, expect, it } from 'vitest'
import '../i18n/config'
import { formatDate, formatWeekRange } from './dateFormat'

// 2026-10-03 は土曜
const KEY = '2026-10-03'

describe('formatDate', () => {
  it('日本語: 曜日の括弧は半角＋前に空白', () => {
    expect(formatDate(KEY, 'monthDay', 'ja')).toBe('10月3日')
    expect(formatDate(KEY, 'monthDayWeekday', 'ja')).toBe('10月3日 (土)')
    expect(formatDate(KEY, 'monthDayWeekdayLong', 'ja')).toBe('10月3日 (土)')
    expect(formatDate(KEY, 'shortDate', 'ja')).toBe('10/3')
    expect(formatDate(KEY, 'shortDateWeekday', 'ja')).toBe('10/3 (土)')
    expect(formatDate(KEY, 'shortDateWeekdayYear', 'ja')).toBe('2026/10/3 (土)')
    expect(formatDate(KEY, 'yearMonth', 'ja')).toBe('2026年10月')
    expect(formatDate(KEY, 'fullDate', 'ja')).toBe('2026年10月3日')
    expect(formatDate(new Date(2026, 9, 3, 9, 5), 'monthDayTime', 'ja')).toBe('10月3日 09:05')
  })

  it('英語: 曜日は前に置く', () => {
    expect(formatDate(KEY, 'monthDay', 'en')).toBe('Oct 3')
    expect(formatDate(KEY, 'monthDayWeekday', 'en')).toBe('Sat, Oct 3')
    expect(formatDate(KEY, 'monthDayWeekdayLong', 'en')).toBe('Saturday, Oct 3')
    expect(formatDate(KEY, 'shortDate', 'en')).toBe('Oct 3')
    expect(formatDate(KEY, 'shortDateWeekday', 'en')).toBe('Sat 10/3')
    expect(formatDate(KEY, 'shortDateWeekdayYear', 'en')).toBe('Sat 10/3/2026')
    expect(formatDate(KEY, 'yearMonth', 'en')).toBe('October 2026')
    expect(formatDate(KEY, 'fullDate', 'en')).toBe('October 3rd, 2026')
    expect(formatDate(new Date(2026, 9, 3, 9, 5), 'monthDayTime', 'en')).toBe('Oct 3, 09:05')
  })

  it('日付キーと Date は同じ日になる', () => {
    expect(formatDate(new Date(2026, 9, 3), 'monthDay', 'ja')).toBe(formatDate(KEY, 'monthDay', 'ja'))
  })
})

describe('formatWeekRange', () => {
  it('日本語: 同じ月なら終わりは日だけ、月をまたぐと年を前に', () => {
    expect(formatWeekRange(new Date(2026, 9, 7), 'ja')).toBe('10月5日〜11日、2026年')
    expect(formatWeekRange(new Date(2026, 9, 1), 'ja')).toBe('2026年9月28日〜10月4日')
  })

  it('英語: 同じ月・同じ年・年またぎ', () => {
    expect(formatWeekRange(new Date(2026, 9, 7), 'en')).toBe('Oct 5 – 11, 2026')
    expect(formatWeekRange(new Date(2026, 9, 1), 'en')).toBe('Sep 28 – Oct 4, 2026')
    expect(formatWeekRange(new Date(2026, 11, 30), 'en')).toBe('Dec 28, 2026 – Jan 3, 2027')
  })
})
