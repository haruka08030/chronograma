import { describe, expect, it } from 'vitest'
import {
  eventSpansOnDay,
  timerSpanOnDay,
  unrecordedGaps,
  unrecordedGapsForDay,
  unrecordedMinutes,
  unrecordedMinutesOnDay,
} from './unrecordedGaps'
import { absentOnOf } from './timetable'
import { courseKey } from './courseLinks'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import { instantFromWall, appTimeZone } from './timeZone'
import type { Task } from '../types/task'

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return h! * 60 + m!
}
const span = (a: string, b: string) => ({ start: hm(a), end: b === '24:00' ? 24 * 60 : hm(b) })

describe('unrecordedGaps', () => {
  it('過ぎた日: 起きてから寝るまでのうち、記録の無い 30 分以上の所', () => {
    const gaps = unrecordedGaps({
      records: [span('08:00', '09:00'), span('11:00', '12:00'), span('12:20', '18:00')],
      sleeps: [span('00:00', '07:00'), span('23:00', '24:00')],
      limitMin: null,
    })
    // 7:00–8:00（起きてから最初の記録まで）、9:00–11:00、18:00–23:00（寝るまで）。12:00–12:20 は 30 分未満で出さない
    expect(gaps).toEqual([span('07:00', '08:00'), span('09:00', '11:00'), span('18:00', '23:00')])
    expect(unrecordedMinutes(gaps)).toBe(60 + 120 + 300)
  })

  it('ちょうど 30 分の抜けは出し、29 分は出さない', () => {
    const base = { sleeps: [], limitMin: null }
    expect(unrecordedGaps({ ...base, records: [span('09:00', '10:00'), span('10:30', '11:00')] })).toEqual([span('10:00', '10:30')])
    expect(unrecordedGaps({ ...base, records: [span('09:00', '10:00'), span('10:29', '11:00')] })).toEqual([])
  })

  it('睡眠の記録が無ければ、記録の最初〜最後の間だけ（朝・夜の何もない時間は出さない）', () => {
    const gaps = unrecordedGaps({ records: [span('10:00', '11:00'), span('14:00', '15:00')], sleeps: [], limitMin: null })
    expect(gaps).toEqual([span('11:00', '14:00')])
  })

  it('記録も睡眠も無い日は出さない', () => {
    expect(unrecordedGaps({ records: [], sleeps: [], limitMin: null })).toEqual([])
    expect(unrecordedGaps({ records: [], sleeps: [], limitMin: hm('16:00') })).toEqual([])
  })

  it('今日は今まで（今・これからの時間には出さない）。起きていれば記録が無くても起きてから今まで', () => {
    expect(unrecordedGaps({ records: [span('09:00', '10:00')], sleeps: [span('00:00', '07:00')], limitMin: hm('16:00') })).toEqual([
      span('07:00', '09:00'),
      span('10:00', '16:00'),
    ])
    expect(unrecordedGaps({ records: [], sleeps: [span('00:30', '07:00')], limitMin: hm('08:00') })).toEqual([span('07:00', '08:00')])
    // 起きたばかり（30 分たっていない）
    expect(unrecordedGaps({ records: [], sleeps: [span('00:30', '07:00')], limitMin: hm('07:20') })).toEqual([])
  })

  it('今日で睡眠が無ければ、最初の記録から今まで', () => {
    expect(unrecordedGaps({ records: [span('09:00', '10:00')], sleeps: [], limitMin: hm('12:00') })).toEqual([span('10:00', '12:00')])
  })

  it('先の日（limitMin 0）は出さない', () => {
    expect(unrecordedGaps({ records: [span('09:00', '10:00'), span('14:00', '15:00')], sleeps: [], limitMin: 0 })).toEqual([])
  })

  it('昼寝は記録と同じく埋まっている扱い（寝た時刻にはしない）', () => {
    const gaps = unrecordedGaps({
      records: [span('09:00', '10:00'), span('16:00', '17:00')],
      sleeps: [span('00:00', '08:00'), span('13:00', '14:00')],
      limitMin: null,
    })
    expect(gaps).toEqual([span('08:00', '09:00'), span('10:00', '13:00'), span('14:00', '16:00')])
  })

  it('夜中に始まった睡眠の前（前の晩の夜ふかし）は出さず、起きた時刻から', () => {
    const gaps = unrecordedGaps({
      records: [span('00:00', '00:30'), span('10:00', '11:00')],
      sleeps: [span('01:30', '08:00')],
      limitMin: null,
    })
    expect(gaps).toEqual([span('08:00', '10:00')])
  })

  it('重なった記録・寝る前に終わらない記録もまとめて埋まっている扱い', () => {
    const gaps = unrecordedGaps({
      records: [span('09:00', '12:00'), span('10:00', '11:00'), span('22:00', '24:00')],
      sleeps: [span('00:00', '07:00'), span('23:30', '24:00')],
      limitMin: null,
    })
    expect(gaps).toEqual([span('07:00', '09:00'), span('12:00', '22:00')])
  })

  it('動いているタイマーの時間は記録している所なので出さない', () => {
    const gaps = unrecordedGaps({
      records: [span('09:00', '10:00')],
      sleeps: [span('00:00', '07:00')],
      limitMin: hm('16:00'),
      timer: span('15:00', '16:00'),
    })
    expect(gaps).toEqual([span('07:00', '09:00'), span('10:00', '15:00')])
  })
})

describe('unrecordedGapsForDay', () => {
  const log = (id: string, dueDate: string, startTime: string, endTime: string, extra: Partial<Task> = {}): Task => ({
    ...makeTask({ title: id, listId: INBOX_LIST_ID }, 0),
    id,
    kind: 'log',
    completed: true,
    dueDate,
    startTime,
    endTime,
    ...extra,
  })

  it('日をまたぐ睡眠は、その日にかかる区間で起きた・寝た時刻を決める', () => {
    const logs = [
      log('sleep1', '2026-10-06', '23:30', '07:00', { kind: 'sleep', endDate: '2026-10-07' }),
      log('work', '2026-10-07', '09:00', '12:00'),
      log('sleep2', '2026-10-07', '23:00', '06:30', { kind: 'sleep', endDate: '2026-10-08' }),
    ]
    expect(unrecordedGapsForDay(logs, '2026-10-07', null)).toEqual([span('07:00', '09:00'), span('12:00', '23:00')])
  })

  it('タイマーは今日の始めた時刻から今まで', () => {
    const tz = appTimeZone()
    const startedAt = new Date(instantFromWall('2026-10-07', '14:00', tz)).toISOString()
    const timer = { taskTitle: 'x', startedAt, tags: [] }
    expect(timerSpanOnDay(timer, '2026-10-07', hm('16:00'))).toEqual(span('14:00', '16:00'))
    // 前の日に始めたタイマーは 0 時から
    expect(timerSpanOnDay(timer, '2026-10-08', hm('01:00'))).toEqual(span('00:00', '01:00'))
    // 過ぎた日・先に始めたものは関係ない
    expect(timerSpanOnDay(timer, '2026-10-06', null)).toBeNull()
    expect(timerSpanOnDay(timer, '2026-10-06', hm('10:00'))).toBeNull()
  })
})

describe('予定（授業・バイト）は出たものとして記録の無い時間を埋める', () => {
  const D = '2026-10-07'
  const base = (id: string, extra: Partial<Task>): Task => ({ ...makeTask({ title: id, listId: INBOX_LIST_ID }, 0), id, ...extra })
  const log = (id: string, startTime: string, endTime: string, extra: Partial<Task> = {}) =>
    base(id, { kind: 'log', completed: true, dueDate: D, startTime, endTime, ...extra })
  const event = (title: string, startTime: string | null, endTime: string | null, extra: Partial<Task> = {}) =>
    base(title, { kind: 'event', title, scheduledDate: D, dueDate: null, startTime, endTime, ...extra })
  const pastDay = () => null
  // 起きて 07:00、09:00–12:00 は授業（記録なし）、12:00–13:00 昼、13:00–14:30 も授業、その後 18:00–19:00 に記録
  const tasks = (...extra: Task[]) => [
    log('sleep', '00:00', '07:00', { kind: 'sleep' }),
    log('breakfast', '07:00', '09:00'),
    log('lunch', '12:00', '13:00'),
    log('gym', '18:00', '19:00'),
    log('night', '23:00', '24:00', { kind: 'sleep', endTime: '06:00', endDate: '2026-10-08' }),
    ...extra,
  ]

  it('授業の間は記録なしに入れない（見出し・ふりかえり・タイムラインの点線の枠が同じ）', () => {
    const all = tasks(event('統計学', '09:00', '12:00'), event('経済学', '13:00', '14:30'))
    // 抜けは 14:30–18:00 と 19:00–23:00 だけ
    expect(unrecordedMinutesOnDay(all, D, pastDay)).toBe(210 + 240)
    const busy = eventSpansOnDay(all, D)
    expect(busy).toEqual([span('09:00', '12:00'), span('13:00', '14:30')])
    expect(
      unrecordedGapsForDay(
        all.filter((t) => t.kind === 'log' || t.kind === 'sleep'),
        D,
        null,
        null,
        busy,
      ),
    ).toEqual([span('14:30', '18:00'), span('19:00', '23:00')])
    // 予定が無ければ授業の時間も記録なし
    expect(unrecordedMinutesOnDay(tasks(), D, pastDay)).toBe(180 + 300 + 240)
  })

  it('欠席にした授業の回は埋めない（記録なしに戻る）', () => {
    const all = tasks(event('統計学', '09:00', '12:00'), event('経済学', '13:00', '14:30'))
    expect(unrecordedMinutesOnDay(all, D, pastDay, null, undefined, absentOnOf({ absences: {} }))).toBe(210 + 240)
    // 統計学を休んだ日は 09:00–12:00 が記録なしに戻る（ほかの日の欠席は関係ない）
    const absentOn = absentOnOf({ absences: { [courseKey('統計学')]: [D, '2026-09-30'] } })
    expect(unrecordedMinutesOnDay(all, D, pastDay, null, undefined, absentOn)).toBe(180 + 210 + 240)
    expect(eventSpansOnDay(all, D, absentOnOf({ absences: { [courseKey('統計学')]: ['2026-09-30'] } }))).toHaveLength(2)
  })

  it('時刻の無い（終日の）予定・ゴミ箱の予定は埋めない', () => {
    const all = tasks(event('学園祭', null, null), event('統計学', '09:00', '12:00', { deletedAt: '2026-10-07T00:00:00Z' }))
    expect(eventSpansOnDay(all, D)).toEqual([])
    expect(unrecordedMinutesOnDay(all, D, pastDay)).toBe(180 + 300 + 240)
  })

  it('予定は起きた・寝た時刻には使わない（記録の前後に広げない）', () => {
    const all = [log('work', '10:00', '11:00'), event('バイト', '17:00', '22:00')]
    // 過ぎた日は最後の記録で終わる
    expect(unrecordedMinutesOnDay(all, D, pastDay)).toBe(0)
  })
})
