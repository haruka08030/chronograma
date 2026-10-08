import { describe, expect, it } from 'vitest'
import {
  dailyDue,
  effectiveReminders,
  localNow,
  minutesOfClock,
  morningDigest,
  remindersInWindow,
  staleTimerDue,
  wallMs,
  wrapUpDue,
  type ReminderSettings,
  type ReminderTask,
} from './schedule'

const task = (p: Partial<ReminderTask> & { id: string }): ReminderTask => ({ title: p.id, list_id: 'inbox', ...p })
const settings = (p: Partial<ReminderSettings> = {}): ReminderSettings => ({
  eventReminderMinutes: 10,
  dueReminders: true,
  recordPrompts: true,
  ...p,
})
/** その時刻を含む 5 分の幅（cron 1 回ぶん） */
const tick = (date: string, time: string): [number, number] => {
  const to = wallMs(date, time)!
  return [to - 5 * 60_000, to]
}

describe('minutesOfClock', () => {
  it('HH:mm と HH:mm:ss の両方を読み、壊れた値は null', () => {
    expect(minutesOfClock('09:30')).toBe(570)
    expect(minutesOfClock('09:30:00')).toBe(570)
    expect(minutesOfClock('24:00')).toBeNull()
    expect(minutesOfClock(null)).toBeNull()
  })
})

describe('remindersInWindow', () => {
  const plan = task({ id: 'zemi', scheduled_date: '2026-10-05', start_time: '15:00', end_time: '16:30' })

  it('予定の開始 N 分前と、終わったときの記録の確認', () => {
    expect(remindersInWindow([plan], settings(), ...tick('2026-10-05', '14:50')).map((r) => r.kind)).toEqual(['start'])
    expect(remindersInWindow([plan], settings(), ...tick('2026-10-05', '16:30')).map((r) => r.kind)).toEqual(['record'])
    expect(remindersInWindow([plan], settings({ recordPrompts: false }), ...tick('2026-10-05', '16:30'))).toEqual([])
  })

  it('締切は前日 20:00 と、時刻つきなら 3 時間前（締切の時刻ちょうどには鳴らない）', () => {
    const es = task({ id: 'es', due_date: '2026-10-05', due_time: '18:00' })
    expect(remindersInWindow([es], settings(), ...tick('2026-10-04', '20:00')).map((r) => r.key)).toEqual(['es:dueDay:-240:2026-10-05'])
    expect(remindersInWindow([es], settings(), ...tick('2026-10-05', '15:00')).map((r) => r.minutesBefore)).toEqual([180])
    expect(remindersInWindow([es], settings(), ...tick('2026-10-05', '18:00'))).toEqual([])
    const dateOnly = task({ id: 'report', due_date: '2026-10-05' })
    expect(effectiveReminders(dateOnly, settings())).toEqual([{ at: 'dueDay', minutes: -240 }])
  })

  it('タスクで決めた通知は既定の代わりに使う。空なら鳴らさない', () => {
    const es = task({ id: 'es', due_date: '2026-10-10', due_time: '18:00', reminders: [{ at: 'dueDay', minutes: -7 * 1440 + 20 * 60 }] })
    expect(remindersInWindow([es], settings(), ...tick('2026-10-03', '20:00')).map((r) => r.taskId)).toEqual(['es'])
    expect(remindersInWindow([es], settings(), ...tick('2026-10-09', '20:00'))).toEqual([])
    const quiet = { ...plan, reminders: [] }
    expect(remindersInWindow([quiet], settings(), ...tick('2026-10-05', '14:50'))).toEqual([])
  })

  it('日をまたぐ予定の終わりは翌日', () => {
    const night = task({ id: 'night', scheduled_date: '2026-10-05', start_time: '23:00', end_time: '01:00' })
    expect(remindersInWindow([night], settings(), ...tick('2026-10-06', '01:00')).map((r) => r.kind)).toEqual(['record'])
  })
})

describe('morningDigest', () => {
  it('今日の予定・今日の締切（時刻順）・期限切れを数える', () => {
    const d = morningDigest(
      [
        task({ id: 'a', scheduled_date: '2026-10-05' }),
        task({ id: 'b', due_date: '2026-10-05', due_time: '18:00' }),
        task({ id: 'c', due_date: '2026-10-05', due_time: '09:00' }),
        task({ id: 'd', due_date: '2026-10-01' }),
      ],
      '2026-10-05',
    )
    expect(d).toEqual({
      planned: 1,
      due: [
        { title: 'c', time: '09:00' },
        { title: 'b', time: '18:00' },
      ],
      overdue: 1,
    })
  })
})

describe('dailyDue / staleTimerDue', () => {
  it('朝のまとめは指定時刻から 60 分以内に 1 日 1 回', () => {
    expect(dailyDue('08:30', null, '2026-10-05', 8 * 60 + 30)).toBe(true)
    expect(dailyDue('08:30', '2026-10-05', '2026-10-05', 8 * 60 + 35)).toBe(false)
    expect(dailyDue('08:30', null, '2026-10-05', 10 * 60)).toBe(false)
  })

  it('タイマーは 3 時間を超えたら 1 回だけ', () => {
    const start = '2026-10-05T00:00:00.000Z'
    const at = (h: number) => Date.parse(start) + h * 3600_000
    expect(staleTimerDue(start, at(2.9), null)).toBe(false)
    expect(staleTimerDue(start, at(3), null)).toBe(true)
    expect(staleTimerDue(start, at(5), start)).toBe(false)
  })
})

describe('夜の締め（wrapUpDue）', () => {
  it('利用者のタイムゾーンで決めた時刻から 60 分の間に 1 回だけ', () => {
    // 13:00 UTC は東京の 22:00、ニューヨークの 9:00
    const now = new Date('2026-10-08T13:00:00Z')
    const tokyo = localNow('Asia/Tokyo', now)
    expect(tokyo).toEqual({ date: '2026-10-08', minutes: 22 * 60 })
    expect(wrapUpDue('22:00', null, tokyo.date, tokyo.minutes, 30)).toBe(true)
    const ny = localNow('America/New_York', now)
    expect(ny).toEqual({ date: '2026-10-08', minutes: 9 * 60 })
    expect(wrapUpDue('22:00', null, ny.date, ny.minutes, 30)).toBe(false)
    // 59 分後まで。60 分を過ぎたらその日は出さない
    expect(wrapUpDue('22:00', null, '2026-10-08', 22 * 60 + 59, 30)).toBe(true)
    expect(wrapUpDue('22:00', null, '2026-10-08', 23 * 60, 30)).toBe(false)
    expect(wrapUpDue('22:00', null, '2026-10-08', 21 * 60 + 59, 30)).toBe(false)
  })

  it('その日にもう送ったら出さない。オフ（null）なら出さない', () => {
    expect(wrapUpDue('22:00', '2026-10-08', '2026-10-08', 22 * 60, 30)).toBe(false)
    expect(wrapUpDue('22:00', '2026-10-07', '2026-10-08', 22 * 60, 30)).toBe(true)
    expect(wrapUpDue(null, null, '2026-10-08', 22 * 60, 30)).toBe(false)
  })

  it('その日の記録が 0 なら出さない（使っていない日に責めない）', () => {
    expect(wrapUpDue('22:00', null, '2026-10-08', 22 * 60, 0)).toBe(false)
  })

  it('読めないタイムゾーンは UTC で数える', () => {
    expect(localNow('Not/AZone', new Date('2026-10-08T22:05:00Z'))).toEqual({ date: '2026-10-08', minutes: 22 * 60 + 5 })
  })
})
