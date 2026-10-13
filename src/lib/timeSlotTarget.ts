import { useTaskStore } from '../store/taskStore'
import type { TaskList } from '../types/list'
import type { Task } from '../types/task'
import { openTaskMenu } from './overlays'
import { toDateKey } from './dateKey'
import { appToday } from './timeZone'

/** 「時間を決める」の幅（`TimeSlotMenu` と同じ）。行の右端にそろえて出す */
export const TIME_SLOT_MENU_WIDTH = 288

/** 「時間を決める」を出せるタスクか（タスクのリストの、未完了で時間未定のもの。いつか・チェックリストは日に置かない） */
export function canPickTime(task: Task, lists: readonly TaskList[]): boolean {
  const kind = lists.find((l) => l.id === task.listId)?.kind ?? 'tasks'
  return kind === 'tasks' && !task.completed && !task.startTime
}

/** どの日の空きを探すか（やる日 → 締切の日 → 今日） */
export function timeSlotDateKey(task: Task): string {
  return task.scheduledDate ?? task.dueDate ?? toDateKey(appToday())
}

/** 行（`data-task-row`）の下、右端にそろえて「時間を決める」を開く。行が見つからなければ左上 */
export function openTimeSlotUnderRow(taskId: string, dateKey: string) {
  const r = document.querySelector(`[data-task-row="${CSS.escape(taskId)}"]`)?.getBoundingClientRect()
  openTaskMenu({ kind: 'timeSlot', x: r ? r.right - TIME_SLOT_MENU_WIDTH : 0, y: r ? r.bottom + 4 : 0, taskId, dateKey })
}

/**
 * 一覧の行から「時間を決める」を開く（S キー）。出せないタスク（時間が決まっている・完了・いつかなど）なら開かず false。
 * `dateKey` を渡すとその日の空きを探す（今日の計画は見ている日）。省略すると `timeSlotDateKey`
 */
export function openTimeSlotForTask(taskId: string, dateKey?: string): boolean {
  const { tasks, lists } = useTaskStore.getState()
  const task = tasks.find((x) => x.id === taskId)
  if (!task || !canPickTime(task, lists)) return false
  openTimeSlotUnderRow(taskId, dateKey ?? timeSlotDateKey(task))
  return true
}
