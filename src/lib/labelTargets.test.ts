import { describe, expect, it } from 'vitest'
import {
  hoursText,
  normalizeLabelTargets,
  parseTargetHours,
  periodTargetMinutes,
  targetHoursInput,
  validTargetMinutes,
} from './labelTargets'

describe('ラベルの週の目安（#291）', () => {
  it('欄の時間を分にする（小数・全角も読む）。空・0 は目安なし、読めなければ undefined', () => {
    expect(parseTargetHours('15')).toBe(900)
    expect(parseTargetHours('1.5')).toBe(90)
    expect(parseTargetHours('１５')).toBe(900)
    expect(parseTargetHours('2.')).toBe(120)
    expect(parseTargetHours('')).toBeNull()
    expect(parseTargetHours(' 0 ')).toBeNull()
    expect(parseTargetHours('abc')).toBeUndefined()
    expect(parseTargetHours('-3')).toBeUndefined()
    // 1 週間より多い時間は 1 週間に丸める
    expect(parseTargetHours('500')).toBe(168 * 60)
  })

  it('欄に出す時間と「記録 / 目安」の時間', () => {
    expect(targetHoursInput(900)).toBe('15')
    expect(targetHoursInput(90)).toBe('1.5')
    expect(targetHoursInput(undefined)).toBe('')
    expect(hoursText(390)).toBe('6.5')
    expect(hoursText(900)).toBe('15')
    expect(hoursText(0)).toBe('0')
  })

  it('保存されていた値の壊れたところは目安なし', () => {
    expect(normalizeLabelTargets({ 勉強: 900, ES: 0, バイト: 'x', '': 60 })).toEqual({ 勉強: 900 })
    expect(normalizeLabelTargets(null)).toEqual({})
    expect(normalizeLabelTargets([1])).toEqual({})
    expect(validTargetMinutes(-1)).toBeUndefined()
    expect(validTargetMinutes(Number.NaN)).toBeUndefined()
  })

  it('週はそのまま、月はその月の日数に合わせる（× 日数 ÷ 7、30 分に丸める）', () => {
    expect(periodTargetMinutes(900, 'week', new Date(2026, 9, 8))).toBe(900)
    // 15 時間 × 31 日 ÷ 7 = 66.43 時間 → 66.5 時間
    expect(periodTargetMinutes(900, 'month', new Date(2026, 9, 8))).toBe(66.5 * 60)
    // 2 月（28 日）はちょうど 4 週
    expect(periodTargetMinutes(300, 'month', new Date(2026, 1, 10))).toBe(20 * 60)
  })
})
