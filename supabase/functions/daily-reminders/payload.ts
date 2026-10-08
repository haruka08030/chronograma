// 通知の文面と中身（Web Push で送る JSON）。index.ts（Deno）から使い、vitest でも確かめる
import { dayWallMs, type FiredReminder } from './schedule.ts'

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
