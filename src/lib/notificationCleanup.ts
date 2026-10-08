/**
 * 済んだ件の通知を通知センターから閉じる。To-Do を完了にした・記録した・記録の確認を閉じた・消したとき
 * （同期で別の端末の完了が届いたときも）、この端末に出ている同じ件の開始前・締切・記録の確認の通知を閉じる。
 * タイマーを止めたら止め忘れの通知も閉じる。残しておくと、あとで「予定どおり」を押しても何も起きない
 */
import { useTaskStore } from '../store/taskStore'
import { isLogTask, type Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'

/** 止め忘れの通知の tag（サーバー・`localReminders.ts` と同じ） */
export const TIMER_NOTIFICATION_TAG = 'chronograma-timer'

/** 1 件ぶんの通知の tag（サーバーの `payload.ts`・`localReminders.ts` と同じ） */
export function taskNotificationTags(taskId: string): string[] {
  return [`chronograma-start-${taskId}`, `chronograma-due-${taskId}`, `chronograma-record-${taskId}`]
}

/**
 * 前と今のタスクから、済んだ件（完了にした・ごみ箱やアーカイブへ移した・無くなった・記録が足された元の予定）の ID。
 * 起動時の読み込み（前が空）では何も返さない
 */
export function settledTaskIds(prev: readonly Task[], next: readonly Task[]): string[] {
  if (prev.length === 0) return []
  const out = new Set<string>()
  const settled = (p: Task, t: Task) => (!p.completed && t.completed) || (isActiveTask(p) && !isActiveTask(t))
  // よくある「1 件を書き換えた」は並びが同じなので、位置で比べて変わったものだけ見る
  if (prev.length === next.length && next.every((t, i) => t.id === prev[i].id)) {
    next.forEach((t, i) => {
      if (t !== prev[i] && settled(prev[i], t)) out.add(t.id)
    })
    return [...out]
  }
  const prevById = new Map(prev.map((t) => [t.id, t]))
  const nextIds = new Set<string>()
  for (const t of next) {
    nextIds.add(t.id)
    const p = prevById.get(t.id)
    if (p) {
      if (p !== t && settled(p, t)) out.add(t.id)
    } else if (isLogTask(t) && t.sourceTaskId) {
      // タイマーなどで記録した元の予定（記録の確認を出さなくてよくなった）
      out.add(t.sourceTaskId)
    }
  }
  for (const p of prev) {
    if (!nextIds.has(p.id)) out.add(p.id)
  }
  return [...out]
}

/** Service Worker の無い環境で出した通知（`new Notification`）。閉じるために tag ごとに持っておく */
const pageNotifications = new Map<string, Notification>()

export function trackPageNotification(tag: string, n: Notification): void {
  pageNotifications.set(tag, n)
  n.addEventListener?.('close', () => {
    if (pageNotifications.get(tag) === n) pageNotifications.delete(tag)
  })
}

/** この端末に出ている、指定の tag の通知を閉じる。通知が使えない環境では何もしない */
export async function closeNotifications(tags: readonly string[]): Promise<void> {
  if (tags.length === 0) return
  const want = new Set(tags)
  for (const tag of want) {
    pageNotifications.get(tag)?.close()
    pageNotifications.delete(tag)
  }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg || typeof reg.getNotifications !== 'function') return
    for (const n of await reg.getNotifications()) {
      if (want.has(n.tag)) n.close()
    }
  } catch {
    /* 閉じられなくても困らない（通知が残るだけ） */
  }
}

/** その件の通知（開始前・締切・記録の確認）を閉じる */
export function closeTaskNotifications(taskId: string): Promise<void> {
  return closeNotifications(taskNotificationTags(taskId))
}

/** ストアを見て、済んだ件・止めたタイマーの通知を閉じ続ける。戻り値で見るのをやめる */
export function installNotificationCleanup(): () => void {
  return useTaskStore.subscribe((s, prev) => {
    const tags: string[] = []
    if (s.tasks !== prev.tasks) {
      for (const id of settledTaskIds(prev.tasks, s.tasks)) tags.push(...taskNotificationTags(id))
    }
    if (prev.activeTimer && s.activeTimer?.startedAt !== prev.activeTimer.startedAt) tags.push(TIMER_NOTIFICATION_TAG)
    if (tags.length > 0) void closeNotifications(tags)
  })
}
