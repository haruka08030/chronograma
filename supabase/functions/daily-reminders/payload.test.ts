import { describe, expect, it } from 'vitest'
import {
  MESSAGES,
  MORNING_URL,
  morningPayload,
  reminderPayload,
  timerEndPayload,
  timerPayload,
  wrapUpPayload,
  WRAP_UP_URL,
  yesterdayLine,
} from './payload'
import type { FiredReminder } from './schedule'

const fired = (p: Partial<FiredReminder> & Pick<FiredReminder, 'kind'>): FiredReminder => ({
  key: 'k',
  taskId: 'task/1',
  title: 'ES 提出',
  date: '2026-10-07',
  startTime: '13:00',
  endTime: '14:30',
  minutesBefore: 10,
  ...p,
})

describe('reminderPayload', () => {
  it('開始前の通知は、その予定と予定の日を開く URL（taskId は入れない）', () => {
    const p = reminderPayload(MESSAGES.ja, fired({ kind: 'start' }), '2026-10-05')
    expect(p.url).toBe('/?view=planner&task=task%2F1&date=2026-10-07')
    expect(p.taskId).toBeUndefined()
    expect(p.tag).toBe('chronograma-start-task/1')
    // 「記録を始める」（#419）。締切の通知には付けない
    expect(p.actions).toEqual([{ action: 'start-timer', title: '記録を始める' }])
    expect(reminderPayload(MESSAGES.en, fired({ kind: 'due', endTime: null }), '2026-10-05').actions).toBeUndefined()
  })

  it('締切の通知は、その To-Do と締切日を開く URL', () => {
    const p = reminderPayload(MESSAGES.en, fired({ kind: 'due', endTime: null }), '2026-10-05')
    const url = new URL(p.url, 'https://x.test')
    expect(url.searchParams.get('view')).toBe('planner')
    expect(url.searchParams.get('task')).toBe('task/1')
    expect(url.searchParams.get('date')).toBe('2026-10-07')
    expect(p.taskId).toBeUndefined()
  })

  it('記録の確認は今までどおり ?record= と「予定どおり」「記録する」', () => {
    const p = reminderPayload(MESSAGES.ja, fired({ kind: 'record' }), '2026-10-07')
    expect(p.url).toBe('/?record=task%2F1')
    expect(p.taskId).toBe('task/1')
    expect(p.actions?.map((a) => a.action)).toEqual(['as-planned', 'record'])
  })
})

describe('timerPayload', () => {
  it('止め忘れの通知は「止める」ボタンと、どのタイマーか（開始時刻）を持つ', () => {
    const p = timerPayload(MESSAGES.ja, '卒論', '2026-10-08T01:00:00.000Z')
    expect(p).toMatchObject({
      title: 'タイマーが動いたままです',
      body: '「卒論」を 3 時間以上記録しています',
      tag: 'chronograma-timer',
      url: '/?view=planner',
      timerStartedAt: '2026-10-08T01:00:00.000Z',
      actions: [{ action: 'stop-timer', title: '止める' }],
    })
    expect(p.taskId).toBeUndefined()
    expect(timerPayload(MESSAGES.en, 'x', 's').actions).toEqual([{ action: 'stop-timer', title: 'Stop' }])
  })
})

describe('timerEndPayload（「あと何分」の時間、#290）', () => {
  it('記録は止めないと伝え、「止める」は止め忘れと同じ動き（そのタイマーを止める）', () => {
    expect(timerEndPayload(MESSAGES.ja, 'レポート', '2026-10-08T00:00:00.000Z')).toEqual({
      title: '「レポート」の時間です',
      body: '記録は止めずに続けています',
      tag: 'chronograma-timer-end',
      url: '/?view=planner',
      timerStartedAt: '2026-10-08T00:00:00.000Z',
      actions: [{ action: 'stop-timer', title: '止める' }],
    })
    expect(timerEndPayload(MESSAGES.en, 'Essay', 's')).toMatchObject({
      title: 'Time\'s up: "Essay"',
      body: 'The timer keeps running until you stop it.',
      actions: [{ action: 'stop-timer', title: 'Stop' }],
    })
  })
})

describe('夜の締め（wrapUpPayload）', () => {
  const d = (p: Partial<{ planned: number; followed: number; unplannedMinutes: number; loggedMinutes: number }>) => ({
    planned: 0,
    followed: 0,
    unplannedMinutes: 0,
    loggedMinutes: 0,
    ...p,
  })

  it('今日の計画の見出しと同じ「予定 N 件中 M 件・予定外」と記録を並べる（残りは出さない）', () => {
    const p = wrapUpPayload(MESSAGES.ja, d({ planned: 4, followed: 3, unplannedMinutes: 60, loggedMinutes: 300 }))
    expect(p).toEqual({
      title: '1 日を締める',
      body: '今日: 予定 4 件中 3 件・予定外 1時間 ・ 記録 5時間',
      tag: 'chronograma-wrap-up',
      url: '/?view=planner&wrap-up=1',
    })
    expect(WRAP_UP_URL).toBe('/?view=planner&wrap-up=1')
  })

  it('数えた予定が無い日は予定の部分を、予定外が 0 なら予定外を出さない', () => {
    expect(wrapUpPayload(MESSAGES.ja, d({ loggedMinutes: 45 })).body).toBe('今日: 記録 45分')
    expect(wrapUpPayload(MESSAGES.ja, d({ planned: 4, followed: 4, loggedMinutes: 120 })).body).toBe('今日: 予定 4 件中 4 件 ・ 記録 2時間')
  })

  it('英語', () => {
    const p = wrapUpPayload(MESSAGES.en, d({ planned: 5, followed: 3, unplannedMinutes: 90, loggedMinutes: 150 }))
    expect(p.body).toBe('Today: 3 of 5 plans · 1h 30m unplanned · 2h 30m logged')
  })
})

describe('morningPayload（#278 昨日の行）', () => {
  const today = { planned: 3, due: [{ title: 'ES', time: '17:00' }], overdue: 0 }
  const y = (p: Partial<{ planned: number; followed: number; unplannedMinutes: number; loggedMinutes: number }>) => ({
    planned: 0,
    followed: 0,
    unplannedMinutes: 0,
    loggedMinutes: 0,
    ...p,
  })

  it('1 行目に今日、2 行目に昨日の「予定 N 件中 M 件・予定外 ・ 記録」', () => {
    const p = morningPayload(MESSAGES.ja, today, y({ planned: 5, followed: 3, unplannedMinutes: 40, loggedMinutes: 250 }))
    expect(p.title).toBe('今日のまとめ')
    expect(p.body).toBe('予定 3 件 ・ 締切: ES（17:00）\n昨日: 予定 5 件中 3 件・予定外 40分 ・ 記録 4時間10分')
    expect(p.tag).toBe('chronograma-morning')
    expect(p.url).toBe(MORNING_URL)
    expect(morningPayload(MESSAGES.en, today, y({ planned: 5, followed: 3, loggedMinutes: 250 })).body).toBe(
      '3 planned · Due: ES (17:00)\nYesterday: 3 of 5 plans · 4h 10m logged',
    )
  })

  it('数えた予定が無い日は記録だけ、記録が無い日は予定だけ', () => {
    expect(yesterdayLine(MESSAGES.ja, y({ loggedMinutes: 45 }))).toBe('昨日: 記録 45分')
    expect(yesterdayLine(MESSAGES.en, y({ planned: 2 }))).toBe('Yesterday: 0 of 2 plans')
  })

  it('昨日に予定も記録も無い・読めなかったときは昨日の行を出さない（今日が空なら今までの文）', () => {
    expect(morningPayload(MESSAGES.ja, today, y({})).body).toBe('予定 3 件 ・ 締切: ES（17:00）')
    expect(morningPayload(MESSAGES.ja, today, null).body).toBe('予定 3 件 ・ 締切: ES（17:00）')
    expect(morningPayload(MESSAGES.en, { planned: 0, due: [], overdue: 0 }, null).body).toBe(MESSAGES.en.emptyDay)
    expect(morningPayload(MESSAGES.en, { planned: 0, due: [], overdue: 0 }, y({ loggedMinutes: 60 })).body).toBe(
      `${MESSAGES.en.emptyDay}\nYesterday: 1h logged`,
    )
  })
})
