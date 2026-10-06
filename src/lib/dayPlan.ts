import { addDays } from 'date-fns'
import { isLogTask, isSleepTask, type Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { durationMinutesForTaskSlot, minutesOfLogOnCalendarDay, taskPlacementDate } from './taskTimeRange'
import { fromDateKey, toDateKey } from './dateKey'
import { appDayKeyOf } from './timeZone'

export interface DayPlan {
  /** 締切（期限日）が過ぎた未完了タスク。どの日に置いたかに関係なく、今日のリストの先頭に出す */
  overdue: Task[]
  /** 過去に置いたまま終わっていないルートタスク（締切切れは overdue へ） */
  carryOver: Task[]
  /** まだ先の日に置いてあるが、締切（期限日）が 3 日以内に来る未完了タスク（課題・ES など） */
  dueSoon: Task[]
  open: Task[]
  done: Task[]
  plannedMinutes: number
  loggedMinutes: number
}

/** 完了したタスクを出す日（完了した日。置いた日・締切より優先）。古い保存で完了時刻が無ければ最後に変えた日 */
export function completionDayKey(task: Pick<Task, 'completedAt' | 'updatedAt'>): string {
  return appDayKeyOf(task.completedAt ?? task.updatedAt)
}

type CalendarPlacedTask = Pick<
  Task,
  'completed' | 'completedAt' | 'updatedAt' | 'dueDate' | 'scheduledDate' | 'endDate' | 'kind' | 'startTime' | 'endTime'
>

/**
 * 時刻つきの予定を、カレンダーで予定の時間帯（タイムラインのブロック・月のチップの時刻）に出すか。
 * 未完了なら出す。完了したものは、予定の日（日をまたぐならその範囲）に終えたときだけ
 */
export function keepsTimeSlot(task: CalendarPlacedTask): boolean {
  if (!task.startTime || !task.endTime) return false
  if (!task.completed) return true
  const placement = taskPlacementDate(task)
  if (!placement) return false
  const done = completionDayKey(task)
  return done >= placement && done <= (task.endDate ?? placement)
}

/**
 * タスクをカレンダー（タイムライン・週の終日の行・月のマス）のどの日に出すか。
 * 完了していれば完了した日（今日の計画の「完了」と同じく、やった日が優先）。未完了は置いた日（予定日 → 締切日）。
 * 時刻つきでも、予定の日に終えたなら予定の時間帯のまま（`keepsTimeSlot`）。
 * 日付を持たないタスクは、完了してもカレンダーには出さない（ごちゃつかせない）
 */
export function calendarDayKey(task: CalendarPlacedTask): string | null {
  const placement = taskPlacementDate(task)
  if (!placement) return null
  if (keepsTimeSlot(task)) return placement
  return task.completed ? completionDayKey(task) : placement
}

/**
 * 締切の日にも印を出すか。カレンダーは置いた日（実行日 → 締切日）の 1 日にしか出さないので、
 * 実行日が締切と別の日なら、締切の日は空に見えてしまう。未完了で、出している日が締切日と違うものだけ
 */
export function dueMarkDayKey(task: CalendarPlacedTask & { dueDate: string | null }): string | null {
  if (!task.dueDate || task.completed) return null
  return calendarDayKey(task) === task.dueDate ? null : task.dueDate
}

/** 開始時刻つきを時刻順で先に、残りは元の並び順 */
function compareDayTasks(a: Task, b: Task): number {
  if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime)
  if (a.startTime) return -1
  if (b.startTime) return 1
  return a.order - b.order
}

const DUE_SOON_DAYS = 3

/** 「今日の計画」と日次リマインダーで共通の、その日（`yyyy-MM-dd`）の集計 */
export function getDayPlan(
  tasks: readonly Task[],
  dateKey: string,
  /** いつか / チェックリストのリスト。予定・締切の集計に入れない */
  excludedListIds: ReadonlySet<string> = new Set(),
): DayPlan {
  const overdue: Task[] = []
  const carryOver: Task[] = []
  const dueSoon: Task[] = []
  const dueSoonLimit = toDateKey(addDays(fromDateKey(dateKey), DUE_SOON_DAYS))
  const open: Task[] = []
  const done: Task[] = []
  let plannedMinutes = 0
  let loggedMinutes = 0
  for (const task of tasks) {
    if (!isActiveTask(task)) continue
    if (isLogTask(task)) {
      // 睡眠は記録の時間に入れない（毎日 7〜8 時間で他の記録が見えなくなる）
      if (!isSleepTask(task)) loggedMinutes += minutesOfLogOnCalendarDay(task, dateKey)
      continue
    }
    if (task.parentId || excludedListIds.has(task.listId)) continue
    const placed = taskPlacementDate(task)
    if (placed === dateKey && task.startTime && task.endTime) plannedMinutes += durationMinutesForTaskSlot(task) ?? 0
    if (task.completed) {
      // やった日が優先: 置いた日・締切ではなく、完了した日の「完了」に出す
      if (completionDayKey(task) === dateKey) done.push(task)
    } else if (placed === dateKey) {
      open.push(task)
    } else if (task.dueDate && task.dueDate < dateKey) {
      overdue.push(task)
    } else if (placed && placed < dateKey) {
      carryOver.push(task)
    } else if (placed && task.dueDate && task.dueDate > dateKey && task.dueDate <= dueSoonLimit) {
      dueSoon.push(task)
    }
  }
  open.sort(compareDayTasks)
  done.sort(compareDayTasks)
  overdue.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  carryOver.sort((a, b) => (taskPlacementDate(a) ?? '').localeCompare(taskPlacementDate(b) ?? ''))
  dueSoon.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  return { overdue, carryOver, dueSoon, open, done, plannedMinutes, loggedMinutes }
}

/**
 * 「今日やる候補」をスクロールで足していく分。やり残し・締切間近（getDayPlan）より後ろに並べる。
 * 締切がもっと先のもの（締切順）→ 日付なし（並び順）→ 先の日に置いたもの（日付順）。
 */
export function getMoreSuggestions(tasks: readonly Task[], dateKey: string, excludedListIds: ReadonlySet<string> = new Set()): Task[] {
  const dueSoonLimit = toDateKey(addDays(fromDateKey(dateKey), DUE_SOON_DAYS))
  const dueLater: Task[] = []
  const undated: Task[] = []
  const placedLater: Task[] = []
  for (const task of tasks) {
    if (!isActiveTask(task) || task.completed || isLogTask(task)) continue
    if (task.parentId || excludedListIds.has(task.listId)) continue
    const placed = taskPlacementDate(task)
    if (placed === null) undated.push(task)
    else if (placed <= dateKey) continue
    // 締切切れは getDayPlan の overdue で先頭に出している
    else if (task.dueDate && task.dueDate < dateKey) continue
    else if (task.dueDate && task.dueDate > dueSoonLimit) dueLater.push(task)
    else if (!task.dueDate || task.dueDate === dateKey) placedLater.push(task)
  }
  dueLater.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  undated.sort((a, b) => a.order - b.order)
  placedLater.sort((a, b) => (taskPlacementDate(a) ?? '').localeCompare(taskPlacementDate(b) ?? ''))
  return [...dueLater, ...undated, ...placedLater]
}

/** 候補を締切で分けた 1 まとまり。`day` は 1 週間以内のその日、`later` はそれより先、`none` は締切なし */
export type DueGroup = { kind: 'day'; dueDate: string; tasks: Task[] } | { kind: 'later'; tasks: Task[] } | { kind: 'none'; tasks: Task[] }

/** 締切の日ごとに見出しを立てる範囲（見ている日から何日先まで） */
const DUE_GROUP_DAYS = 6

/**
 * 「今日やる候補」を締切で見出しに分ける。見出しに締切を出すので、行には日付を並べない。
 * 1 週間以内は日ごと、それより先は 1 つ、締切なしは最後。まとまりの中は渡した順を保つ
 */
export function groupCandidatesByDue(tasks: readonly Task[], dateKey: string): DueGroup[] {
  const limit = toDateKey(addDays(fromDateKey(dateKey), DUE_GROUP_DAYS))
  const days = new Map<string, Task[]>()
  const later: Task[] = []
  const none: Task[] = []
  for (const task of tasks) {
    const due = task.dueDate
    if (!due) none.push(task)
    else if (due <= limit) days.set(due, [...(days.get(due) ?? []), task])
    else later.push(task)
  }
  const groups: DueGroup[] = [...days.keys()].sort().map((dueDate) => ({ kind: 'day', dueDate, tasks: days.get(dueDate)! }))
  if (later.length > 0) groups.push({ kind: 'later', tasks: later })
  if (none.length > 0) groups.push({ kind: 'none', tasks: none })
  return groups
}
