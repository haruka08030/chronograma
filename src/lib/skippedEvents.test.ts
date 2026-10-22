import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../types/calendarEvent'
import {
  SKIPPED_MAX,
  isSkippedDeletion,
  mergeSkipped,
  normalizeSkippedEvents,
  planSkippedSync,
  skippedAsEvents,
  toSkippedEvent,
  withRemoved,
  withSkipped,
  withSkippedEvents,
  withoutRestored,
} from './skippedEvents'

/** やらなかった予定（#528） */
const gym: CalendarEvent = {
  id: 'gym1',
  summary: 'gym',
  start: '2026-10-20T18:00:00+09:00',
  end: '2026-10-20T19:30:00+09:00',
  startTime: '18:00',
  endTime: '19:30',
  date: '2026-10-20',
  isAllDay: false,
  editable: true,
  htmlLink: 'https://calendar.google.com/x',
}
const AT = '2026-10-20T13:00:00.000Z'
const skip = (e: CalendarEvent = gym, at = AT) => toSkippedEvent(e, at)

describe('isSkippedDeletion', () => {
  const start = Date.parse(gym.start)
  it('始まってから 7 日までに消した予定', () => {
    expect(isSkippedDeletion(gym, start - 60_000, '2026-10-20')).toBe(false)
    expect(isSkippedDeletion(gym, start, '2026-10-20')).toBe(true)
    expect(isSkippedDeletion(gym, start + 7 * 86_400_000, '2026-10-27')).toBe(true)
    expect(isSkippedDeletion(gym, start + 8 * 86_400_000, '2026-10-28')).toBe(false)
  })
  it('終日の予定はその日になってから', () => {
    const fes = { ...gym, isAllDay: true, start: '2026-10-20', date: '2026-10-20' }
    expect(isSkippedDeletion(fes, 0, '2026-10-19')).toBe(false)
    expect(isSkippedDeletion(fes, 0, '2026-10-20')).toBe(true)
    expect(isSkippedDeletion(fes, 0, '2026-10-28')).toBe(false)
  })
})

describe('控えと表示', () => {
  it('控えは出すのに要る項目だけ。出すときは動かせないやらなかった予定', () => {
    const s = skip()
    expect(s).not.toHaveProperty('htmlLink')
    expect(s).not.toHaveProperty('editable')
    expect(skippedAsEvents([s])[0]).toMatchObject({ id: 'gym1', summary: 'gym', editable: false, skipped: true })
    expect(skippedAsEvents([s])[0]).not.toHaveProperty('skippedAt')
  })

  it('本当に消した予定は出さない。Google にある予定が先', () => {
    const list = withRemoved([skip(), skip({ ...gym, id: 'b' })], 'gym1')
    expect(skippedAsEvents(list).map((e) => e.id)).toEqual(['b'])
    const live = [{ ...gym, id: 'b', summary: 'live' }]
    expect(withSkippedEvents(live, skippedAsEvents(list))).toEqual(live)
  })

  it('壊れた値は外し、日付の新しい順に上限まで', () => {
    const many = Array.from({ length: SKIPPED_MAX + 3 }, (_, i) => ({
      ...skip(),
      id: `e${i}`,
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    }))
    const out = normalizeSkippedEvents([{ id: 'x' }, null, ...many])
    expect(out).toHaveLength(SKIPPED_MAX)
    expect(out[0]!.date >= out.at(-1)!.date).toBe(true)
  })
})

describe('足す・外す', () => {
  it('持っている予定・本当に消した印のある予定は足さない。変わらなければ同じ並び', () => {
    const list = withRemoved([skip()], 'gym1', '2026-10-21T00:00:00.000Z')
    const now = Date.parse('2026-10-22T00:00:00.000Z')
    expect(withSkipped(list, [skip()], now)).toBe(list)
    expect(withSkipped(list, [skip({ ...gym, id: 'b' })], now).map((e) => e.id)).toEqual(['b', 'gym1'])
  })

  it('本当に消した印は 30 日で落とす', () => {
    const list = withRemoved([skip()], 'gym1', '2026-10-21T00:00:00.000Z')
    expect(withSkipped(list, [], Date.parse('2026-11-25T00:00:00.000Z'))).toEqual([])
  })

  it('予定に戻った予定は外す（本当に消した印は残す）', () => {
    const list = [skip(), ...withRemoved([skip({ ...gym, id: 'b' })], 'b')]
    expect(withoutRestored(list, new Set(['gym1', 'b'])).map((e) => e.id)).toEqual(['b'])
    expect(withoutRestored(list, new Set(['zzz']))).toBe(list)
  })
})

describe('同期', () => {
  const a = skip()
  const b = skip({ ...gym, id: 'b' })

  it('両方で変えたら合わせる。どちらかで消した予定は消したまま', () => {
    expect(mergeSkipped([a], withRemoved([a, b], 'gym1')).map((e) => [e.id, !!e.removed])).toEqual(
      [
        ['b', false],
        ['gym1', true],
      ].sort(),
    )
  })

  it('サーバーに行が無ければ送る', () => {
    expect(planSkippedSync({ events: [a], updatedAt: 't1' }, null).push?.events).toEqual([a])
  })

  it('この端末でまだ合わせていなければ両方を合わせて送る', () => {
    const plan = planSkippedSync({ events: [a], updatedAt: null }, { events: [b], updatedAt: 'r1' }, 'now')
    expect(plan.apply?.events.map((e) => e.id).sort()).toEqual(['b', 'gym1'])
    expect(plan.push?.base).toBe('r1')
  })

  it('手元だけで変えたら送り、ほかの端末だけで変えたら合わせる', () => {
    expect(
      planSkippedSync({ events: [a, b], updatedAt: 'l2', syncedAt: 'r1' }, { events: [a], updatedAt: 'r1' }).push?.events,
    ).toHaveLength(2)
    expect(
      planSkippedSync({ events: [a], updatedAt: 'r1', syncedAt: 'r1' }, { events: [a, b], updatedAt: 'r2' }).apply?.events,
    ).toHaveLength(2)
  })

  it('両方で変えたら合わせて送る', () => {
    const plan = planSkippedSync(
      { events: [a], updatedAt: '2026-10-21T00:00:00Z', syncedAt: 'r1' },
      { events: [b], updatedAt: '2026-10-21T01:00:00Z' },
      'now',
    )
    expect(plan.apply?.events.map((e) => e.id).sort()).toEqual(['b', 'gym1'])
    expect(plan.push?.base).toBe('2026-10-21T01:00:00Z')
  })
})
