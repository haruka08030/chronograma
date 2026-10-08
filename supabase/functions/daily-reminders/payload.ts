// 通知の文面と中身（Web Push で送る JSON）。index.ts（Deno）から使い、vitest でも確かめる
import { dayWallMs, type FiredReminder } from './schedule.ts'
import type { WrapUpDigest } from './wrapUp.ts'

export const MESSAGES = {
  ja: {
    morningTitle: '今日のまとめ',
    planned: (n: number) => `予定 ${n} 件`,
    due: (items: string) => `締切: ${items}`,
    overdue: (n: number) => `締切切れ ${n} 件`,
    emptyDay: '今日の予定はまだありません。やることを決めましょう。',
    sep: ' ・ ',
    listSep: '、',
    dueItem: (title: string, time: string | null) => (time ? `${title}（${time}）` : title),
    startBody: (min: number, range: string) => (min > 0 ? `${min} 分後 · ${range}` : `今から · ${range}`),
    dueTitle: (title: string) => `締切: ${title}`,
    dueBody: (day: string, time: string | null) => (time ? `${day} ${time} まで` : `${day}まで`),
    dueGroupTitle: '締切',
    today: '今日',
    tomorrow: '明日',
    recordTitle: (title: string) => `「${title}」は終わりましたか？`,
    asPlanned: '予定どおり',
    record: '記録する',
    timerTitle: 'タイマーが動いたままです',
    timerBody: (title: string) => `「${title}」を 3 時間以上記録しています`,
    stopTimer: '止める',
    wrapUpTitle: '1 日を締める',
    wrapUpToday: (parts: string) => `今日: ${parts}`,
    wrapUpDone: (done: number, total: number) => `予定 ${total} 件中 ${done} 件完了`,
    wrapUpLogged: (time: string) => `記録 ${time}`,
    wrapUpLeft: (n: number) => `残り ${n} 件`,
    duration: (h: number, m: number) => (h === 0 ? `${m}分` : m === 0 ? `${h}時間` : `${h}時間${m}分`),
  },
  en: {
    morningTitle: 'Today at a glance',
    planned: (n: number) => `${n} planned`,
    due: (items: string) => `Due: ${items}`,
    overdue: (n: number) => `${n} overdue`,
    emptyDay: 'Nothing planned yet. Decide what to do today.',
    sep: ' · ',
    listSep: ', ',
    dueItem: (title: string, time: string | null) => (time ? `${title} (${time})` : title),
    startBody: (min: number, range: string) => (min > 0 ? `In ${min} min · ${range}` : `Now · ${range}`),
    dueTitle: (title: string) => `Due: ${title}`,
    dueBody: (day: string, time: string | null) => (time ? `${day} ${time}` : day),
    dueGroupTitle: 'Deadlines',
    today: 'Today',
    tomorrow: 'Tomorrow',
    recordTitle: (title: string) => `Did "${title}" happen?`,
    asPlanned: 'As planned',
    record: 'Record',
    timerTitle: 'Your timer is still running',
    timerBody: (title: string) => `"${title}" has been running for over 3 hours`,
    stopTimer: 'Stop',
    wrapUpTitle: 'Wrap up the day',
    wrapUpToday: (parts: string) => `Today: ${parts}`,
    wrapUpDone: (done: number, total: number) => `${done} of ${total} done`,
    wrapUpLogged: (time: string) => `${time} logged`,
    wrapUpLeft: (n: number) => `${n} left`,
    duration: (h: number, m: number) => (h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`),
  },
} as const
export type Msg = (typeof MESSAGES)['ja'] | (typeof MESSAGES)['en']

export function range(start: string | null, end: string | null): string {
  return end ? `${start} – ${end}` : (start ?? '')
}

export function dayLabel(msg: Msg, date: string, today: string): string {
  const diff = Math.round(((dayWallMs(date) ?? 0) - (dayWallMs(today) ?? 0)) / 86_400_000)
  if (diff === 0) return msg.today
  if (diff === 1) return msg.tomorrow
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}`
}

export type Payload = {
  title: string
  body: string
  tag: string
  url: string
  taskId?: string
  /** 止め忘れの通知: どのタイマーか（開始時刻。「止める」で別のタイマーを止めないように） */
  timerStartedAt?: string
  actions?: { action: string; title: string }[]
}

/**
 * 開始前・締切の通知を押したときに開く URL。その To-Do・予定の詳細と、その日（予定の日・締切日）を開く。
 * 中身に `taskId` は入れない（前の版の Service Worker は `taskId` を記録の確認として扱う。`?task=` なら今日の計画が開くだけ）
 */
export function taskUrl(taskId: string, date: string): string {
  return `/?view=planner&task=${encodeURIComponent(taskId)}&date=${encodeURIComponent(date)}`
}

export function reminderPayload(msg: Msg, r: FiredReminder, today: string): Payload {
  if (r.kind === 'start') {
    return {
      title: r.title,
      body: msg.startBody(r.minutesBefore, range(r.startTime, r.endTime)),
      tag: `chronograma-start-${r.taskId}`,
      url: taskUrl(r.taskId, r.date),
    }
  }
  if (r.kind === 'due') {
    return {
      title: msg.dueTitle(r.title),
      body: msg.dueBody(dayLabel(msg, r.date, today), r.startTime),
      tag: `chronograma-due-${r.taskId}`,
      url: taskUrl(r.taskId, r.date),
    }
  }
  return {
    title: msg.recordTitle(r.title),
    body: range(r.startTime, r.endTime),
    tag: `chronograma-record-${r.taskId}`,
    url: `/?record=${encodeURIComponent(r.taskId)}`,
    taskId: r.taskId,
    actions: [
      { action: 'as-planned', title: msg.asPlanned },
      { action: 'record', title: msg.record },
    ],
  }
}

/**
 * タイマーの止め忘れ。「止める」で、アプリを開いてそのタイマーを止め、記録の終わりを直せる詳細を開く。
 * 本文を押したときは動いているタイマーが見える今日の計画
 */
export function timerPayload(msg: Msg, title: string, startedAt: string): Payload {
  return {
    title: msg.timerTitle,
    body: msg.timerBody(title),
    tag: 'chronograma-timer',
    url: '/?view=planner',
    timerStartedAt: startedAt,
    actions: [{ action: 'stop-timer', title: msg.stopTimer }],
  }
}

/** 夜の締めの通知を押したときに開く URL。今日の計画の「1 日を締める」へ */
export const WRAP_UP_URL = '/?view=planner&wrap-up=1'

/**
 * 夜の締め（#299）。数字だけを並べる（責める言葉は入れない）: 「今日: 予定 5 件中 3 件完了 ・ 記録 2時間30分 ・ 残り 2 件」。
 * To-Do が無い日は予定の部分を、残りが無ければ残りを出さない。記録が 0 の日は送らない（呼び出し側で `wrapUpDue`）
 */
export function wrapUpPayload(msg: Msg, d: WrapUpDigest): Payload {
  const parts = [
    d.total > 0 ? msg.wrapUpDone(d.done, d.total) : null,
    msg.wrapUpLogged(msg.duration(Math.floor(d.loggedMinutes / 60), d.loggedMinutes % 60)),
    d.open > 0 ? msg.wrapUpLeft(d.open) : null,
  ].filter(Boolean)
  return {
    title: msg.wrapUpTitle,
    body: msg.wrapUpToday(parts.join(msg.sep)),
    tag: 'chronograma-wrap-up',
    url: WRAP_UP_URL,
  }
}
