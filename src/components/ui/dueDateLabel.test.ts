import { describe, expect, it } from 'vitest'
import i18next, { type TFunction } from 'i18next'
import ja from '../../locales/ja'
import en from '../../locales/en'
import { dueDateLabel } from './dueDateLabel'

const i18n = i18next.createInstance()
await i18n.init({
  lng: 'ja',
  resources: { ja: { translation: ja }, en: { translation: en } },
  interpolation: { escapeValue: false },
})
const t = i18n.getFixedT('ja') as TFunction

// 見ている日は 2026-10-05（月）、今は 14:30
const base = { dayKey: '2026-10-05', now: new Date(2026, 9, 5, 14, 30) }

describe('dueDateLabel（見ている日と比べる）', () => {
  it('今日・明日は言葉で、時刻があれば添える', () => {
    expect(dueDateLabel('2026-10-05', null, t, 'ja', base)).toEqual({ text: '今日まで', tone: 'today' })
    expect(dueDateLabel('2026-10-05', '18:00', t, 'ja', base)).toEqual({ text: '今日 18:00 まで', tone: 'today' })
    expect(dueDateLabel('2026-10-05', '12:00', t, 'ja', base).tone).toBe('overdue')
    expect(dueDateLabel('2026-10-06', null, t, 'ja', base)).toEqual({ text: '明日まで', tone: 'tomorrow' })
  })

  it('2〜3 日後は「あと ◯ 日」で明日と同じ色、それより先は日付だけ', () => {
    expect(dueDateLabel('2026-10-07', null, t, 'ja', base)).toEqual({ text: '10/7 (水)まで・あと 2 日', tone: 'tomorrow' })
    expect(dueDateLabel('2026-10-09', null, t, 'ja', base).tone).toBe('future')
  })

  it('過ぎた締切は「◯日遅れ」（見ている日から数える）', () => {
    expect(dueDateLabel('2026-10-02', null, t, 'ja', base)).toEqual({ text: '10/2 (金)まで・3日遅れ', tone: 'overdue' })
  })

  it('別の日を見ているときは、その日が「今日」の代わり', () => {
    const later = { dayKey: '2026-10-08', now: base.now }
    expect(dueDateLabel('2026-10-09', null, t, 'ja', later).text).toBe('明日まで')
    expect(dueDateLabel('2026-10-07', null, t, 'ja', later)).toEqual({ text: '10/7 (水)まで・1日遅れ', tone: 'overdue' })
  })
})
