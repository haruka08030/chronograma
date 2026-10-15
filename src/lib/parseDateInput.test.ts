import { describe, expect, it } from 'vitest'
import { parseDateInput } from './parseDateInput'

// 2026-09-30（水）。見ている月は 10 月
const TODAY = new Date(2026, 8, 30, 12, 0, 0)
const OCT = new Date(2026, 9, 1)
const ja = (s: string) => parseDateInput(s, true, OCT, TODAY)
const en = (s: string) => parseDateInput(s, false, OCT, TODAY)

describe('parseDateInput', () => {
  it('日だけは見ている月のその日', () => {
    expect(ja('20')).toBe('2026-10-20')
    expect(ja('5日')).toBe('2026-10-05')
    expect(ja('32')).toBeNull()
  })

  it('月日・年月日の数字', () => {
    expect(ja('1020')).toBe('2026-10-20')
    expect(ja('102')).toBe('2027-01-02')
    expect(ja('20271231')).toBe('2027-12-31')
    expect(ja('20260230')).toBeNull()
  })

  it('区切りは / - . どれでも', () => {
    expect(ja('10/20')).toBe('2026-10-20')
    expect(ja('10-20')).toBe('2026-10-20')
    expect(ja('10.20')).toBe('2026-10-20')
    expect(ja('2027.1.5')).toBe('2027-01-05')
    expect(ja('2027-01-05')).toBe('2027-01-05')
    expect(ja('１０／２０')).toBe('2026-10-20')
  })

  it('クイック追加と同じ言い方', () => {
    expect(ja('明日')).toBe('2026-10-01')
    expect(ja('金曜')).toBe('2026-10-02')
    expect(ja('10月20日')).toBe('2026-10-20')
    expect(ja('3日後')).toBe('2026-10-03')
    expect(en('tomorrow')).toBe('2026-10-01')
    expect(en('Dec 5')).toBe('2026-12-05')
  })

  it('日付だけで書いていなければ読まない', () => {
    expect(ja('')).toBeNull()
    expect(ja('あ')).toBeNull()
    expect(ja('明日やる')).toBeNull()
    expect(ja('明日 10時')).toBeNull()
    expect(ja('13/1')).toBeNull()
  })
})
