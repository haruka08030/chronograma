import { addDays, differenceInCalendarDays } from 'date-fns'
import { isTodoTask, type Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { fromDateKey, toDateKey } from './dateKey'

/** 今日の計画の行に「3日目」を出し、週のふりかえりの「持ち越しが多いタスク」に入れる、続けて持ち越した日数の下限 */
export const CARRY_SHOW_DAYS = 2

type CarryFields = Pick<Task, 'completed' | 'scheduledDate' | 'carriedDays'>

/**
 * 実行日を付け替えたあとの「続けて持ち越した日数」（`carriedDays`）。
 * 今日かそれより前に置いていた終わっていない To-Do を後ろの日へ回したら、やらずに過ぎた日の分だけ足す
 * （今日 → 明日で +1、3 日前 → 今日で +3、3 日前 → 来週で +4）。
 * 完了した・実行日を外したら 0。先の日どうしの付け替え・前へ戻すのは数えない
 */
export function carriedDaysAfter(prev: CarryFields, next: CarryFields, todayKey: string): number {
  if (next.completed || next.scheduledDate === null) return 0
  const from = prev.scheduledDate
  const to = next.scheduledDate
  const base = prev.carriedDays ?? 0
  if (prev.completed || from === null || from > todayKey || to <= from) return base
  const until = to > todayKey ? toDateKey(addDays(fromDateKey(todayKey), 1)) : to
  return base + differenceInCalendarDays(fromDateKey(until), fromDateKey(from))
}

/**
 * その日（`dateKey`）までに続けて持ち越した日数。付け替えで数えた分（`carriedDays`）に、
 * 前の日に置いたまま（やり残し）の日数を足す。終わったもの・実行日の無いものは 0
 */
export function carriedDaysOn(task: CarryFields, dateKey: string): number {
  if (task.completed || task.scheduledDate === null) return 0
  const waiting = task.scheduledDate < dateKey ? differenceInCalendarDays(fromDateKey(dateKey), fromDateKey(task.scheduledDate)) : 0
  return (task.carriedDays ?? 0) + waiting
}

/** 続けて持ち越した日数の上限（10 年。DB の `037` の制約と同じ） */
const MAX_CARRIED_DAYS = 3650

/** 保存・同期から読んだ続けて持ち越した日数。0 以上の整数でなければ 0 */
export function readCarriedDays(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0
  return Math.min(Math.max(0, Math.round(raw)), MAX_CARRIED_DAYS)
}

/** 週のふりかえりの「持ち越しが多いタスク」に並べる数 */
export const CARRIED_ROWS = 3

/**
 * 週のふりかえりの「持ち越しが多いタスク」: その日（今日）までに続けて 2 日以上持ち越している、終わっていない To-Do を
 * 日数の多い順に（同じなら題名順）。いつか / チェックリストのリスト・予定・記録・削除・アーカイブは入れない
 */
export function mostCarriedTasks(
  tasks: readonly Task[],
  dateKey: string,
  excludedListIds: ReadonlySet<string> = new Set(),
  limit = CARRIED_ROWS,
): { task: Task; days: number }[] {
  return tasks
    .filter((t) => isTodoTask(t) && isActiveTask(t) && !excludedListIds.has(t.listId))
    .map((task) => ({ task, days: carriedDaysOn(task, dateKey) }))
    .filter((r) => r.days >= CARRY_SHOW_DAYS)
    .sort((a, b) => b.days - a.days || (a.task.title < b.task.title ? -1 : a.task.title > b.task.title ? 1 : 0))
    .slice(0, limit)
}
