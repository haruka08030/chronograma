import { describe, expect, it } from 'vitest'
import { EXTRA_TIME_ZONE_LABEL_MAX, extraZoneFullLabel, extraZoneLabel, normalizeExtraTimeZones, planExtraTimeZoneSync } from './extraTimeZones'
import { zoneOptionLabel } from './timeZone'

const T1 = '2026-10-01T00:00:00.000Z'
const T2 = '2026-10-02T00:00:00.000Z'
const NOW = '2026-10-03T00:00:00.000Z'
const AT = Date.parse('2026-01-15T12:00:00Z')

const london = { tz: 'Europe/London', label: 'ロンドンの友達' }
const ny = { tz: 'America/New_York', label: '' }

describe('他のタイムゾーンの読み込み', () => {
  it('前の版の文字列の配列も読める（名前なし）', () => {
    expect(normalizeExtraTimeZones(['Europe/London'])).toEqual([{ tz: 'Europe/London', label: '' }])
  })

  it('使えないタイムゾーン・重複・壊れた行は外し、上限の数まで', () => {
    expect(
      normalizeExtraTimeZones(['Not/AZone', null, 42, { label: 'x' }, london, 'Europe/London', ny, 'Asia/Tokyo']),
    ).toEqual([london, ny])
  })

  it('名前は前後の空白を落とし、長すぎれば切る', () => {
    const [z] = normalizeExtraTimeZones([{ tz: 'Asia/Tokyo', label: `  ${'あ'.repeat(EXTRA_TIME_ZONE_LABEL_MAX + 5)}  ` }])
    expect(z.label).toBe('あ'.repeat(EXTRA_TIME_ZONE_LABEL_MAX))
  })

  it('配列でなければ空', () => {
    expect(normalizeExtraTimeZones(undefined)).toEqual([])
    expect(normalizeExtraTimeZones('Europe/London')).toEqual([])
  })
})

describe('他のタイムゾーンの表示名', () => {
  it('名前があれば名前、無ければタイムゾーンの名前', () => {
    expect(extraZoneLabel(london, 'ja', AT)).toBe('ロンドンの友達')
    expect(extraZoneLabel(ny, 'en', AT)).toBe(zoneOptionLabel('America/New_York', 'en', AT))
  })

  it('ヒントには名前とタイムゾーンの両方（切れて見えない分も分かる）', () => {
    expect(extraZoneFullLabel(london, 'en', AT)).toBe(`ロンドンの友達 · ${zoneOptionLabel('Europe/London', 'en', AT)}`)
    expect(extraZoneFullLabel(ny, 'en', AT)).toBe(zoneOptionLabel('America/New_York', 'en', AT))
  })
})

describe('他のタイムゾーンの同期', () => {
  it('サーバーに無ければ手元を送る', () => {
    expect(planExtraTimeZoneSync({ zones: [london], updatedAt: T1 }, null, NOW)).toEqual({ push: { zones: [london], updatedAt: T1 } })
  })

  it('サーバーが新しければ、ほかの端末で付けた名前に合わせる', () => {
    const plan = planExtraTimeZoneSync({ zones: [{ tz: 'Europe/London', label: '' }], updatedAt: T1 }, { zones: [london], updatedAt: T2 }, NOW)
    expect(plan).toEqual({ apply: { zones: [london], updatedAt: T2 } })
  })

  it('手元が新しければ送る（名前を消したのも送る）', () => {
    const cleared = { tz: 'Europe/London', label: '' }
    const plan = planExtraTimeZoneSync({ zones: [cleared], updatedAt: T2 }, { zones: [london], updatedAt: T1 }, NOW)
    expect(plan).toEqual({ push: { zones: [cleared], updatedAt: T2 } })
  })

  it('同じ時刻・同じ中身なら何もしない', () => {
    expect(planExtraTimeZoneSync({ zones: [london], updatedAt: T1 }, { zones: [london], updatedAt: T1 }, NOW)).toEqual({})
  })

  it('初めて同期する端末は両方を合わせる（サーバーの並びが先、名前はサーバーに無ければ手元の名前）', () => {
    const plan = planExtraTimeZoneSync(
      { zones: [ny, { tz: 'Europe/London', label: '' }], updatedAt: null },
      { zones: [{ tz: 'America/New_York', label: '' }], updatedAt: T1 },
      NOW,
    )
    expect(plan.apply).toEqual({ zones: [ny, { tz: 'Europe/London', label: '' }], updatedAt: NOW })
    expect(plan.push).toEqual({ zones: [ny, { tz: 'Europe/London', label: '' }], updatedAt: NOW })
  })

  it('初めての端末でも、サーバーと同じになるなら送らない', () => {
    const plan = planExtraTimeZoneSync({ zones: [], updatedAt: null }, { zones: [london], updatedAt: T1 }, NOW)
    expect(plan).toEqual({ apply: { zones: [london], updatedAt: T1 } })
  })
})
