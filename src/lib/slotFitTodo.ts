import { isTodoTask, type Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { compareByOrder } from './orderCompare'

/**
 * タイムラインの空きをドラッグしたとき、その枠に置ける To-Do を 1 件だけ選ぶ（作成カードの「◯◯を置く」）。
 * 見積もりが枠の長さ以内の、未完了でまだ時刻の無い To-Do（サブタスク・いつか / チェックリストのリスト・予定・記録は出さない）。
 * 先の日に置いたもの（その日にやると決めたもの）も出さない。
 * 選び方: 締切の近い順（締切なしは後ろ）→ その日に置いた行 → 並び順。合うものが無ければ null
 */
export function pickTodoForSlot(
  tasks: readonly Task[],
  dateKey: string,
  slotMinutes: number,
  excludedListIds: ReadonlySet<string>,
): Task | null {
  let best: Task | null = null
  for (const task of tasks) {
    if (!isActiveTask(task) || !isTodoTask(task) || task.completed || task.parentId) continue
    if (excludedListIds.has(task.listId) || task.startTime) continue
    if (task.scheduledDate && task.scheduledDate > dateKey) continue
    const estimate = task.estimateMinutes
    if (!estimate || estimate <= 0 || estimate > slotMinutes) continue
    if (!best || compareForSlot(task, best, dateKey) < 0) best = task
  }
  return best
}

function compareForSlot(a: Task, b: Task, dateKey: string): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate)
  }
  const aToday = a.scheduledDate === dateKey
  const bToday = b.scheduledDate === dateKey
  if (aToday !== bToday) return aToday ? -1 : 1
  return compareByOrder(a, b)
}
