import { describe, expect, it } from 'vitest'
import '../i18n/config'
import { menuDateHint } from './menuDateHint'

// 2026-10-06 は火曜
const TODAY = '2026-10-06'
const at = (date: string | null, time: string | null = null) => ({ date, time })

describe('menuDateHint', () => {
  it('今日・明日は言葉で、時刻があれば添える', () => {
    expect(menuDateHint([at(TODAY, '18:00')], 'ja', TODAY)).toBe('今日 18:00')
    expect(menuDateHint([at('2026-10-07')], 'ja', TODAY)).toBe('明日')
    expect(menuDateHint([at(TODAY, '18:00')], 'en', TODAY)).toBe('Today 18:00')
  })

  it('ほかの日は短い日付と曜日、今年でなければ年も', () => {
    expect(menuDateHint([at('2026-10-10')], 'ja', TODAY)).toBe('10/10 (土)')
    expect(menuDateHint([at('2027-01-08', '09:30')], 'ja', TODAY)).toBe('2027/1/8 (金) 09:30')
  })

  it('日付が無い・選んだタスクで値が違うときは出さない', () => {
    expect(menuDateHint([], 'ja', TODAY)).toBeUndefined()
    expect(menuDateHint([at(null)], 'ja', TODAY)).toBeUndefined()
    expect(menuDateHint([at(TODAY), at('2026-10-10')], 'ja', TODAY)).toBeUndefined()
    expect(menuDateHint([at(TODAY, '18:00'), at(TODAY)], 'ja', TODAY)).toBeUndefined()
    expect(menuDateHint([at(TODAY, '18:00'), at(TODAY, '18:00')], 'ja', TODAY)).toBe('今日 18:00')
  })
})
