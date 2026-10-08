import { describe, expect, it } from 'vitest'
import { timerSpanOnDay, unrecordedGaps, unrecordedGapsForDay, unrecordedMinutes } from './unrecordedGaps'
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
