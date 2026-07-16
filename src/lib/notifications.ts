import type { Task } from '../types/task'
import { isToday, parseISO } from 'date-fns'
import i18n from '../i18n/config'
import { isActiveTask } from './taskLifecycle'

const notifiedIds = new Set<string>()

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function checkAndNotify(tasks: Task[]) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const dueTasks = tasks.filter(
    (t) =>
      !t.completed &&
      isActiveTask(t) &&
      t.parentId === null &&
      t.dueDate &&
      isToday(parseISO(t.dueDate)) &&
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
