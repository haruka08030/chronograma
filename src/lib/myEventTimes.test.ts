import { beforeEach, describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../types/calendarEvent'
import { mergeMyEventTimes, planMyEventTimesSync } from './settingPlans'
import {
  MY_EVENT_TIMES_MAX,
  fitMyEventTimes,
  fitMyTime,
  normalizeMyEventTimes,
  withMyEventTimes,
  withMyTime,
  withRemovedTime,
  type MyEventTime,
} from './myEventTimes'
import { setAppTimeZoneSetting } from './timeZone'

/** 自分の時間（#625）。時刻は UTC で書き、アプリのタイムゾーンも UTC にする */
const at = (hm: string, day = '2026-10-27') => `${day}T${hm}:00.000Z`
const span = (s: string, e: string) => ({ start: at(s), end: at(e) })

const talk: CalendarEvent = {
  id: 'talk',
  summary: '説明会',
  start: at('13:00'),
  end: at('15:00'),
  startTime: '13:00',
  endTime: '15:00',
  date: '2026-10-27',
  isAllDay: false,
}

const NOW = '2026-10-26T00:00:00.000Z'

function mine(over: Partial<MyEventTime> = {}): MyEventTime {
  return { id: 'talk', ...span('13:30', '15:00'), heldStart: at('13:00'), heldEnd: at('15:00'), updatedAt: NOW, ...over }
}

beforeEach(() => setAppTimeZoneSetting('UTC'))

describe('fitMyTime: 開催時間が変わったとき', () => {
  it('収まっていればそのまま', () => {
    expect(fitMyTime(span('13:30', '14:00'), span('13:00', '15:00'))).toEqual(span('13:30', '14:00'))
  })
  it('はみ出した側だけ削る', () => {
    expect(fitMyTime(span('13:30', '15:00'), span('13:00', '14:30'))).toEqual(span('13:30', '14:30'))
    expect(fitMyTime(span('12:00', '14:00'), span('13:00', '15:00'))).toEqual(span('13:00', '14:00'))
    expect(fitMyTime(span('12:00', '16:00'), span('13:00', '15:00'))).toEqual(span('13:00', '15:00'))
  })
  it('重ならなければ null（くっついているだけも）', () => {
    expect(fitMyTime(span('16:00', '17:00'), span('13:00', '15:00'))).toBeNull()
    expect(fitMyTime(span('15:00', '16:00'), span('13:00', '15:00'))).toBeNull()
  })
  it('書き方が違っても同じ時刻なら同じ', () => {
    expect(fitMyTime(span('13:30', '15:00'), { start: '2026-10-27T22:00:00+09:00', end: '2026-10-28T00:00:00+09:00' })).toEqual(
      span('13:30', '15:00'),
    )
  })
})

describe('自分の時間を付ける・外す', () => {
  it('付ける。開催時間の控えも持つ', () => {
    const list = withMyTime([], talk, span('13:30', '15:00'), NOW)
    expect(list).toEqual([mine()])
  })
  it('開催時間と同じにしたら外す（外した印を残す）。持っていなければ何もしない', () => {
    const list = withMyTime([mine()], talk, span('13:00', '15:00'), '2026-10-26T01:00:00.000Z')
    expect(list).toEqual([{ ...mine(), removed: true, updatedAt: '2026-10-26T01:00:00.000Z' }])
    const none: MyEventTime[] = []
    expect(withMyTime(none, talk, span('13:00', '15:00'), NOW)).toBe(none)
  })
  it('自分の時間を当てた予定から付け直すときも、控えは開催時間', () => {
    const [shown] = withMyEventTimes([talk], [mine()])
    const list = withMyTime([mine()], shown!, span('14:00', '15:00'), NOW)
    expect(list[0]).toMatchObject({ start: at('14:00'), heldStart: at('13:00'), heldEnd: at('15:00') })
  })
  it('変わらなければ同じ並び', () => {
    const list = [mine()]
    expect(withMyTime(list, talk, span('13:30', '15:00'), NOW)).toBe(list)
  })
  it('外す', () => {
    expect(withRemovedTime([mine()], 'talk', 'x')).toEqual([{ ...mine(), removed: true, updatedAt: 'x' }])
    const list = [mine()]
    expect(withRemovedTime(list, 'other')).toBe(list)
  })
  it('終わって半年たった自分の時間・外して 30 日たった印は、次に付けたときに落とす', () => {
    const old = mine({ id: 'old', ...span('10:00', '11:00'), start: '2026-01-01T10:00:00.000Z', end: '2026-01-01T11:00:00.000Z' })
    const oldHeld = { ...old, heldStart: old.start, heldEnd: old.end }
    const removed = mine({ id: 'gone', removed: true, updatedAt: '2026-09-01T00:00:00.000Z' })
    const list = withMyTime([oldHeld, removed], talk, span('13:30', '15:00'), NOW)
    expect(list.map((e) => e.id)).toEqual(['talk'])
  })
})

describe('予定に当てる', () => {
  it('自分の時間で出し、開催時間を held に残す', () => {
    const [e] = withMyEventTimes([talk], [mine()])
    expect(e).toMatchObject({ start: at('13:30'), end: at('15:00'), startTime: '13:30', endTime: '15:00', date: '2026-10-27' })
    expect(e!.held).toEqual(span('13:00', '15:00'))
  })
  it('何度当てても同じ。外したら開催時間に戻る', () => {
    const once = withMyEventTimes([talk], [mine()])
    expect(withMyEventTimes(once, [mine()])).toBe(once)
    const back = withMyEventTimes(once, [mine({ removed: true })])
    expect(back[0]).toEqual(talk)
  })
  it('自分の時間が無ければ同じ並び', () => {
    const events = [talk]
    expect(withMyEventTimes(events, [])).toBe(events)
  })
  it('控えを合わせる前に開催時間が変わっていても、削った時間で出す', () => {
    const moved = { ...talk, end: at('14:30'), endTime: '14:30' }
    const [e] = withMyEventTimes([moved], [mine()])
    expect(e).toMatchObject({ startTime: '13:30', endTime: '14:30', held: span('13:00', '14:30') })
  })
  it('終日の予定・重ならなくなった予定には当てない', () => {
    const later = { ...talk, start: at('16:00'), end: at('17:00'), startTime: '16:00', endTime: '17:00' }
    expect(withMyEventTimes([later], [mine()])[0]).toBe(later)
    const allDay = { ...talk, isAllDay: true, start: '2026-10-27', end: '2026-10-28', startTime: null, endTime: null }
    expect(withMyEventTimes([allDay], [mine()])[0]).toBe(allDay)
  })
})

describe('fitMyEventTimes: Google から取った予定に合わせる', () => {
  const T = '2026-10-26T02:00:00.000Z'
  it('開催時間が控えと同じなら何もしない', () => {
    const list = [mine()]
    expect(fitMyEventTimes(list, [talk], T)).toBe(list)
  })
  it('はみ出した側を削り、控えを新しい開催時間にする', () => {
    const shorter = { ...talk, end: at('14:30') }
    expect(fitMyEventTimes([mine()], [shorter], T)).toEqual([mine({ ...span('13:30', '14:30'), heldEnd: at('14:30'), updatedAt: T })])
  })
  it('収まっていれば時間はそのまま、控えだけ合わせる', () => {
    const longer = { ...talk, start: at('12:00') }
    expect(fitMyEventTimes([mine()], [longer], T)).toEqual([mine({ heldStart: at('12:00'), updatedAt: T })])
  })
  it('重ならなくなった・開催時間と同じになった・終日になったら外す', () => {
    const later = { ...talk, start: at('16:00'), end: at('17:00') }
    expect(fitMyEventTimes([mine()], [later], T)[0]).toMatchObject({ removed: true, updatedAt: T })
    const inside = { ...talk, start: at('13:30'), end: at('14:00') }
    expect(fitMyEventTimes([mine()], [inside], T)[0]).toMatchObject({ removed: true })
    const allDay = { ...talk, isAllDay: true, start: '2026-10-27', end: '2026-10-28' }
    expect(fitMyEventTimes([mine()], [allDay], T)[0]).toMatchObject({ removed: true })
  })
  it('取った予定に無い・外した自分の時間はそのまま', () => {
    const list = [mine({ id: 'other' }), mine({ removed: true })]
    expect(fitMyEventTimes(list, [{ ...talk, end: at('14:30') }], T)).toBe(list)
  })
})

describe('保存・同期', () => {
  it('壊れた値は外し、開始の新しい順に上限まで', () => {
    const many = Array.from({ length: MY_EVENT_TIMES_MAX + 3 }, (_, i) =>
      mine({ id: `e${i}`, start: new Date(Date.parse(at('13:30')) - i * 86_400_000).toISOString() }),
    )
    const out = normalizeMyEventTimes([...many, { id: 'bad', start: 'x' }, 'x', null, mine({ id: 'e0' })])
    expect(out).toHaveLength(MY_EVENT_TIMES_MAX)
    expect(out[0]!.id).toBe('e0')
    expect(normalizeMyEventTimes([mine({ ...span('15:00', '13:00') })])).toEqual([])
    expect(normalizeMyEventTimes('x')).toEqual([])
  })
  it('両方で変えたら予定ごとに新しいほう（外した印も）', () => {
    const a = mine({ updatedAt: '2026-10-26T01:00:00.000Z' })
    const b = mine({ ...span('14:00', '15:00'), updatedAt: '2026-10-26T02:00:00.000Z' })
    const removed = mine({ id: 'x', removed: true, updatedAt: '2026-10-26T03:00:00.000Z' })
    const x = mine({ id: 'x', updatedAt: '2026-10-26T00:00:00.000Z' })
    const merged = mergeMyEventTimes([a, x], [b, removed])
    expect(merged.find((e) => e.id === 'talk')).toEqual(b)
    expect(merged.find((e) => e.id === 'x')).toEqual(removed)
    expect(mergeMyEventTimes([b], [a])).toEqual([b])
  })
  it('サーバーに行が無ければ送る。まだ一度も付けていなければ何もしない', () => {
    expect(planMyEventTimesSync({ times: [mine()], updatedAt: 't1' }, null).push?.times).toEqual([mine()])
    expect(planMyEventTimesSync({ times: [], updatedAt: null }, null)).toEqual({})
  })
  it('手元だけで変えたら送り、ほかの端末だけで変えたら合わせる', () => {
    const other = mine({ id: 'other' })
    expect(
      planMyEventTimesSync({ times: [mine(), other], updatedAt: 'l2', syncedAt: 'r1' }, { times: [mine()], updatedAt: 'r1' }).push?.times,
    ).toHaveLength(2)
    expect(
      planMyEventTimesSync({ times: [mine()], updatedAt: 'r1', syncedAt: 'r1' }, { times: [mine(), other], updatedAt: 'r2' }).apply?.times,
    ).toHaveLength(2)
  })
  it('両方で変えたら合わせて送る', () => {
    const local = mine({ ...span('14:00', '15:00'), updatedAt: '2026-10-26T02:00:00.000Z' })
    const plan = planMyEventTimesSync(
      { times: [local], updatedAt: '2026-10-26T02:00:00.000Z', syncedAt: 'r1' },
      { times: [mine(), mine({ id: 'other' })], updatedAt: '2026-10-26T03:00:00.000Z' },
      'now',
    )
    expect(plan.apply?.times.map((e) => [e.id, e.start])).toEqual([
      ['talk', at('14:00')],
      ['other', at('13:30')],
    ])
    expect(plan.push?.base).toBe('2026-10-26T03:00:00.000Z')
    expect(plan.conflicts).toBe(0)
  })
})
