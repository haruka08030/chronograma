import { describe, expect, it } from 'vitest'
import { duesOn, duesSoon, dueSoonTone, nextDueDate, normalizeDues, type DueItem } from './dues'

const due = (over: Partial<DueItem>): DueItem => ({ id: 'd', title: '家賃', date: '2026-10-27', repeat: 'none', notifyDays: 0, ...over })

describe('引き落とし・期限の日（#454）', () => {
  it('1 回きりはその日まで、過ぎたら null', () => {
    expect(nextDueDate(due({}), '2026-10-01')).toBe('2026-10-27')
    expect(nextDueDate(due({}), '2026-10-27')).toBe('2026-10-27')
    expect(nextDueDate(due({}), '2026-10-28')).toBeNull()
  })

  it('毎月は同じ「日」。無い日は月末に寄せ、最初の日より前は最初の日', () => {
    const rent = due({ repeat: 'monthly' })
    expect(nextDueDate(rent, '2026-10-28')).toBe('2026-11-27')
    expect(nextDueDate(rent, '2026-12-27')).toBe('2026-12-27')
    expect(nextDueDate(rent, '2026-09-01')).toBe('2026-10-27')
    const end = due({ repeat: 'monthly', date: '2026-01-31' })
    expect(nextDueDate(end, '2026-02-01')).toBe('2026-02-28')
    expect(nextDueDate(end, '2026-03-01')).toBe('2026-03-31')
    expect(nextDueDate(end, '2026-04-01')).toBe('2026-04-30')
  })

  it('毎年は同じ月日（2/29 はうるう年でない年は 2/28）', () => {
    const passport = due({ repeat: 'yearly', date: '2024-02-29' })
    expect(nextDueDate(passport, '2026-01-10')).toBe('2026-02-28')
    expect(nextDueDate(passport, '2026-03-01')).toBe('2027-02-28')
    expect(nextDueDate(passport, '2027-12-01')).toBe('2028-02-29')
  })

  it('カレンダーの印はその日のものだけ、名前順', () => {
    const items = [
      due({ id: 'b', title: 'Netflix', date: '2026-10-05', repeat: 'monthly' }),
      due({ id: 'a', title: 'Amazon', date: '2026-11-05' }),
    ]
    expect(duesOn(items, '2026-11-05').map((d) => d.id)).toEqual(['a', 'b'])
    expect(duesOn(items, '2026-11-06')).toEqual([])
  })

  it('今日の計画には、何日前から の範囲に入ったものを近い順に。当日は必ず', () => {
    const items = [
      due({ id: 'rent', repeat: 'monthly', notifyDays: 3 }),
      due({ id: 'trial', title: '無料体験', date: '2026-10-25', notifyDays: 1 }),
      due({ id: 'today', title: '奨学金', date: '2026-10-24', notifyDays: 0 }),
    ]
    expect(duesSoon(items, '2026-10-24').map((s) => [s.item.id, s.daysLeft])).toEqual([
      ['today', 0],
      ['trial', 1],
      ['rent', 3],
    ])
    expect(duesSoon(items, '2026-10-20')).toEqual([])
    expect([dueSoonTone(0), dueSoonTone(1), dueSoonTone(3)]).toEqual(['today', 'tomorrow', 'future'])
  })

  it('読んだ値は形の合わないもの・同じ id を落とす', () => {
    expect(
      normalizeDues([
        due({}),
        due({ title: '重複' }),
        { id: 'x', title: ' ', date: '2026-10-01' },
        { id: 'y', title: 'Y', date: 'x' },
        { id: 'z', title: 'Z', date: '2026-10-01', repeat: 'weekly', notifyDays: 1000 },
      ]),
    ).toEqual([due({}), { id: 'z', title: 'Z', date: '2026-10-01', repeat: 'none', notifyDays: 365 }])
  })
})
