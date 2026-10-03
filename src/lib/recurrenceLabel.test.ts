import { describe, expect, it } from 'vitest'
import i18next, { type TFunction } from 'i18next'
import ja from '../locales/ja'
import en from '../locales/en'
import { recurrenceLabel } from './recurrenceLabel'

const i18n = i18next.createInstance()
await i18n.init({
  lng: 'ja',
  resources: { ja: { translation: ja }, en: { translation: en } },
  interpolation: { escapeValue: false },
})
const tJa = i18n.getFixedT('ja') as TFunction
const tEn = i18n.getFixedT('en') as TFunction

describe('recurrenceLabel', () => {
  // 2026-10-02 は金曜
  it('曜日つきの毎週は曜日を並べる', () => {
    expect(recurrenceLabel(tJa, { type: 'weekly', interval: 1, weekdays: [1, 3] }, '2026-10-02')).toBe('毎週 月・水')
    expect(recurrenceLabel(tJa, { type: 'weekly', interval: 2, weekdays: [2, 5] }, '2026-10-02')).toBe('2週ごと 火・金')
    expect(recurrenceLabel(tEn, { type: 'weekly', interval: 1, weekdays: [1, 3] }, '2026-10-02')).toBe('Every week on Mon, Wed')
  })

  it('曜日の指定が無い毎週は締切の曜日', () => {
    expect(recurrenceLabel(tJa, { type: 'weekly', interval: 1 }, '2026-10-02')).toBe('毎週 金')
    expect(recurrenceLabel(tJa, { type: 'weekly', interval: 1 }, null)).toBe('毎週')
  })

  it('平日・毎週以外', () => {
    expect(recurrenceLabel(tJa, { type: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] }, '2026-10-02')).toBe('平日')
    expect(recurrenceLabel(tEn, { type: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] }, '2026-10-02')).toBe('Every weekday')
    expect(recurrenceLabel(tJa, { type: 'daily', interval: 1 }, '2026-10-02')).toBe('毎日')
    expect(recurrenceLabel(tJa, { type: 'monthly', interval: 3 }, '2026-10-02')).toBe('3か月ごと')
  })
})
