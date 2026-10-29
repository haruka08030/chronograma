import { describe, expect, it } from 'vitest'
import { GOOGLE_EVENT_COLORS_MAX, normalizeEventColorChoices, resolveEventColors } from './googleEventColors'
import type { CalendarEvent } from '../types/calendarEvent'

const ev = (extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'g1',
  summary: '説明会',
  start: '2026-10-05T15:00:00+09:00',
  end: '2026-10-05T16:00:00+09:00',
  startTime: '15:00',
  endTime: '16:00',
  date: '2026-10-05',
  isAllDay: false,
  baseColor: '#039BE5',
  color: '#039BE5',
  ...extra,
})

describe('Google の予定に付けた色', () => {
  it('読んだ値は形の合わない項目を落とし、上限を超えたら古く付けたものから落とす', () => {
    expect(normalizeEventColorChoices(null)).toEqual({})
    expect(
      normalizeEventColorChoices({
        'e:a': { hex: '#33B679', title: 'ゼミ' },
        'x:b': { hex: '#33B679' },
        'e:c': { hex: 'red' },
        's:d': { hex: '#D50000' },
      }),
    ).toEqual({ 'e:a': { hex: '#33B679', title: 'ゼミ' }, 's:d': { hex: '#D50000', title: '' } })
    const many = Object.fromEntries(
      Array.from({ length: GOOGLE_EVENT_COLORS_MAX + 2 }, (_, i) => [`e:${i}`, { hex: '#33B679', title: 't' }]),
    )
    const kept = Object.keys(normalizeEventColorChoices(many))
    expect(kept).toHaveLength(GOOGLE_EVENT_COLORS_MAX)
    expect(kept[0]).toBe('e:2')
  })

  it('当てても変わらなければ同じ並び', () => {
    const events = [ev()]
    expect(resolveEventColors(events, {})).toBe(events)
    expect(resolveEventColors(events, { 'e:g1': { hex: '#33B679', title: '説明会' } })[0]!.color).toBe('#33B679')
  })
})
