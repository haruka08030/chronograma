import { describe, expect, it } from 'vitest'
import { duesSentKey, duesToNotify, type DueItem } from './dues.ts'
import { MESSAGES, duesPayload } from './payload.ts'

const due = (over: Partial<DueItem>): DueItem => ({ id: 'd', title: '家賃', date: '2026-10-27', repeat: 'monthly', notifyDays: 3, ...over })

describe('引き落とし・期限の日の通知（#454）', () => {
  it('知らせ始める日（何日前）と当日だけ。その間の日は送らない', () => {
    const rent = [due({})]
    expect(duesToNotify(rent, '2026-10-24').map((s) => s.daysLeft)).toEqual([3])
    expect(duesToNotify(rent, '2026-10-25')).toEqual([])
    expect(duesToNotify(rent, '2026-10-27').map((s) => s.daysLeft)).toEqual([0])
    // 毎月なので次の月も
    expect(duesToNotify(rent, '2026-11-24').map((s) => s.date)).toEqual(['2026-11-27'])
    // 当日だけのもの
    expect(duesToNotify([due({ notifyDays: 0, repeat: 'none' })], '2026-10-27').map((s) => s.daysLeft)).toEqual([0])
  })

  it('1 日 1 通にまとめ、日ごとの印で二重に送らない', () => {
    const items = duesToNotify(
      [due({ id: 'a' }), due({ id: 'b', title: '奨学金', date: '2026-10-24', repeat: 'none', notifyDays: 0 })],
      '2026-10-24',
    )
    expect(duesPayload(MESSAGES.ja, items)).toEqual({
      title: '引き落とし・期限',
      body: '奨学金（今日）、家賃（あと 3 日）',
      tag: 'chronograma-dues',
      url: '/?view=planner',
    })
    expect(duesPayload(MESSAGES.en, items).body).toBe('奨学金 (today), 家賃 (in 3 days)')
    expect(duesSentKey('2026-10-24')).toBe('dues|2026-10-24')
  })
})
