import { describe, expect, it } from 'vitest'
import { MESSAGES, reminderPayload, timerPayload } from './payload'
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
