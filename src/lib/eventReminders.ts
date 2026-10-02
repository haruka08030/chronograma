import { format } from 'date-fns'
import i18n from '../i18n/config'
import type { Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { taskPlacementDate } from './taskTimeRange'
import { timeToMinutes } from './timeGrid'
import { zonedNow } from './timeZone'

const NOTIFIED_KEY = 'chronograma-event-reminded'

function readNotified(today: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '{}') as { date?: string; ids?: string[] }
    return new Set(raw.date === today ? raw.ids ?? [] : [])
  } catch {
    return new Set()
  }
}

function saveNotified(today: string, ids: Set<string>) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify({ date: today, ids: [...ids] }))
  } catch {
    /* 保存できなくても通知は出す（重複の可能性だけ残る） */
  }
}

/** 通知すべき予定: 今日・時刻つき・未完了・いつか/チェックリスト以外で、開始 N 分前〜開始 1 分後の範囲 */
export function dueEventReminders(
  tasks: readonly Task[],
  minutesBefore: number,
  excludedListIds: ReadonlySet<string>,
  now = zonedNow(),
): Task[] {
  const today = format(now, 'yyyy-MM-dd')
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return tasks.filter((t) => {
    if (t.parentId || t.completed || t.isTimeLog || !isActiveTask(t) || excludedListIds.has(t.listId)) return false
    if (!t.startTime || taskPlacementDate(t) !== today) return false
    const start = timeToMinutes(t.startTime)
    return nowMin >= start - minutesBefore && nowMin <= start + 1
  })
}

/** 予定の開始前通知（Google カレンダーの「○分前」）。タブが開いている間の分。閉じているときは Web Push 側 */
export function checkEventReminders(
  tasks: readonly Task[],
  minutesBefore: number,
  excludedListIds: ReadonlySet<string>,
  onOpen: () => void,
  now = zonedNow(),
) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
  const today = format(now, 'yyyy-MM-dd')
  const notified = readNotified(today)
  let changed = false
  for (const t of dueEventReminders(tasks, minutesBefore, excludedListIds, now)) {
    if (notified.has(t.id)) continue
    notified.add(t.id)
    changed = true
    const n = new Notification(t.title, {
      body: i18n.t('eventReminders.body', { start: t.startTime, end: t.endTime ?? '' }),
      tag: `chronograma-event-${t.id}`,
    })
    n.onclick = () => {
      window.focus()
      onOpen()
      n.close()
    }
  }
  if (changed) saveNotified(today, notified)
}
