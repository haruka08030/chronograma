import { fromDateKey } from './dateKey'
import type { ToastText } from '../store/storeTypes'
import type { Task } from '../types/task'

/** トーストに出す短い日付（10/4） */
export function shortDate(dateKey: string): string {
  const d = fromDateKey(dateKey)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** ドラッグで別の日へ動かしたときの「元に戻す」の文（1 件なら題名、複数なら件数） */
export function movedToDateLabel(ids: readonly string[], tasks: readonly Pick<Task, 'id' | 'title'>[], dateKey: string): ToastText {
  const date = shortDate(dateKey)
  if (ids.length > 1) return { key: 'undo.tasksMovedToDate', params: { count: ids.length, date } }
  const title = tasks.find((t) => t.id === ids[0])?.title ?? ''
  return { key: 'undo.taskMovedToDate', params: { title, date } }
}
