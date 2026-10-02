import type { Task } from '../types/task'
import { parseISO } from 'date-fns'
import i18n from '../i18n/config'
import { isActiveTask } from './taskLifecycle'
import { isAppToday } from './timeZone'

const notifiedIds = new Set<string>()

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/** `excludedListIds`: いつか / チェックリストのリスト（期限があっても通知しない） */
export function checkAndNotify(tasks: Task[], excludedListIds: ReadonlySet<string> = new Set()) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const dueTasks = tasks.filter(
    (t) =>
      !t.completed &&
      isActiveTask(t) &&
      !excludedListIds.has(t.listId) &&
      t.parentId === null &&
      t.dueDate &&
      isAppToday(parseISO(t.dueDate)) &&
      !notifiedIds.has(t.id),
  )

  for (const task of dueTasks) {
    notifiedIds.add(task.id)
    new Notification(i18n.t('notifications.dueTitle'), {
      body: task.title,
      tag: task.id,
    })
  }
}
