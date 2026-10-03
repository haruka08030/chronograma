/**
 * 繰り返しタスクの次回（純粋な関数。localStorage・i18n を読まない）。
 * 完了したら次の期限の回を作り、完了を取り消したらまだ手を付けていない次回を片付ける
 */
import { addDays, addMonths, addWeeks, addYears, format } from 'date-fns'
import type { Task } from '../types/task'

/** 繰り返しの次回の id。元が次回（`…@日付`）でも、いちばん元の id に次の期限を付ける */
export function recurrenceNextId(id: string, nextDue: string): string {
  return `${id.replace(/@\d{4}-\d{2}-\d{2}$/, '')}@${nextDue}`
}

export function nextDueDate(current: string, recurrence: NonNullable<Task['recurrence']>): string {
  const d = new Date(current + 'T00:00:00')
  switch (recurrence.type) {
    case 'daily': return format(addDays(d, recurrence.interval), 'yyyy-MM-dd')
    case 'weekly': return format(addWeeks(d, recurrence.interval), 'yyyy-MM-dd')
    case 'monthly': return format(addMonths(d, recurrence.interval), 'yyyy-MM-dd')
    case 'yearly': return format(addYears(d, recurrence.interval), 'yyyy-MM-dd')
  }
}

/**
 * 完了 ⇄ 未完了を切り替えた一覧。`id` が無ければ null。
 * 繰り返しを完了したら次回を足し、完了を取り消したらそのとき作った次回を片付ける（まだ手を付けていなければ）
 */
export function toggleTaskCompletion(tasks: Task[], id: string, now: string): Task[] | null {
  const tsk = tasks.find((t) => t.id === id)
  if (!tsk) return null
  const willComplete = !tsk.completed
  let newTasks = tasks.map((t) =>
    t.id === id
      ? {
          ...t,
          completed: willComplete,
          updatedAt: now,
          completedAt: willComplete ? now : null,
        }
      : t,
  )
  if (tsk.recurrence && tsk.dueDate) {
    const nextDue = nextDueDate(tsk.dueDate, tsk.recurrence)
    const nextId = recurrenceNextId(tsk.id, nextDue)
    if (willComplete) {
      // 次回の id を「元の id + 次の期限」で決める。完了 → 戻す → 完了や、2 台で同じ回を完了しても次回は 1 つ
      if (!newTasks.some((t) => t.id === nextId)) {
        const next: Task = {
          ...tsk,
          id: nextId,
          completed: false,
          completedAt: null,
          dueDate: nextDue,
          scheduledDate: tsk.scheduledDate
            ? nextDueDate(tsk.scheduledDate, tsk.recurrence)
            : tsk.scheduledDate ?? null,
          createdAt: now,
          updatedAt: now,
        }
        newTasks = [...newTasks, next]
      }
    } else {
      // 完了を取り消したら、そのとき作った次回を片付ける（まだ手を付けていなければ）
      newTasks = newTasks.filter(
        (t) => !(t.id === nextId && !t.completed && t.updatedAt === t.createdAt),
      )
    }
  }
  return newTasks
}
