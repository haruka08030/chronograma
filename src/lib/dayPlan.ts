import { addDays } from 'date-fns'
import { isEventTask, isLogTask, isSleepTask, isTodoTask, type Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { minutesOfLogOnCalendarDay, taskPlacementDate } from './taskTimeRange'
import { fromDateKey, toDateKey } from './dateKey'
import { appDayKeyOf } from './timeZone'
import { compareByOrder } from './orderCompare'
import { planTiming } from './planTiming'
import { clockOf } from './clockTime'
import type { CalendarEvent } from '../types/calendarEvent'

export interface DayPlan {
  /** 締切（期限日）が過ぎた未完了タスク。どの日に置いたかに関係なく、今日のリストの先頭に出す */
  overdue: Task[]
  /** 過去に置いたまま終わっていないルートタスク（締切切れは overdue へ） */
  carryOver: Task[]
  /** まだ先の日に置いてあるが、締切（期限日）が見ている日〜3 日以内に来る未完了タスク（課題・ES など）。締切が今日なら先の日に置いていても入れる */
  dueSoon: Task[]
  open: Task[]
  done: Task[]
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
  return compareByOrder(a, b)
}

const DUE_SOON_DAYS = 3

/**
 * 今日の計画（やる・やり残し・期限切れ・締切間近・候補・完了の数）に 1 件の To-Do として入れるか。
 * ルートは全部、サブタスクは実行日か締切のあるものだけ（企業の下の ES 締切・面接など。日付の無い子は親の中の手順のまま）。
 * 夜の締め・朝のまとめのサーバー側（`wrapUp.ts`）も同じ決まり
 */
export function isDayPlanTask(task: Pick<Task, 'parentId' | 'scheduledDate' | 'dueDate'>): boolean {
  return !task.parentId || task.scheduledDate !== null || task.dueDate !== null
}

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
  let loggedMinutes = 0
  for (const task of tasks) {
    if (!isActiveTask(task)) continue
    if (isLogTask(task)) {
      // 睡眠は記録の時間に入れない（毎日 7〜8 時間で他の記録が見えなくなる）
      if (!isSleepTask(task)) loggedMinutes += minutesOfLogOnCalendarDay(task, dateKey)
      continue
    }
    // 予定（バイト・授業）は Google の予定と同じく数えない（To-Do・やり残し・完了）。カレンダーで見る。
    // 「予定 / 空き」の時間は週の見出しと同じ dayLoad.ts で数える
    if (!isDayPlanTask(task) || excludedListIds.has(task.listId) || isEventTask(task)) continue
    const placed = taskPlacementDate(task)
    if (task.completed) {
      // やった日が優先: 置いた日・締切ではなく、完了した日の「完了」に出す
      if (completionDayKey(task) === dateKey) done.push(task)
    } else if (placed === dateKey) {
      open.push(task)
    } else if (task.dueDate && task.dueDate < dateKey) {
      overdue.push(task)
    } else if (placed && placed < dateKey) {
      carryOver.push(task)
    } else if (placed && task.dueDate && task.dueDate >= dateKey && task.dueDate <= dueSoonLimit) {
      dueSoon.push(task)
    }
  }
  open.sort(compareDayTasks)
  done.sort(compareDayTasks)
  overdue.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  carryOver.sort((a, b) => (taskPlacementDate(a) ?? '').localeCompare(taskPlacementDate(b) ?? ''))
  dueSoon.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  return { overdue, carryOver, dueSoon, open, done, loggedMinutes }
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
    if (!isActiveTask(task) || task.completed || !isTodoTask(task)) continue
    if (!isDayPlanTask(task) || excludedListIds.has(task.listId)) continue
    const placed = taskPlacementDate(task)
    if (placed === null) undated.push(task)
    else if (placed <= dateKey) continue
    // 締切切れは getDayPlan の overdue で先頭に出している
    else if (task.dueDate && task.dueDate < dateKey) continue
    else if (task.dueDate && task.dueDate > dueSoonLimit) dueLater.push(task)
    // 締切が見ている日〜3 日以内のものは getDayPlan の dueSoon（締切が近い候補）に出している
    else if (!task.dueDate) placedLater.push(task)
  }
  dueLater.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  undated.sort(compareByOrder)
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

/** スマホの今日やる行の一番上に出す 1 件（時間を決めた To-Do・予定・Google の予定）と、始まっているか（`now`）これからか（`next`） */
export type NowNextPlan = { kind: 'now' | 'next' } & NowNextSource
type NowNextSource = { source: 'task'; task: Task } | { source: 'event'; task: Task } | { source: 'google'; event: CalendarEvent }

/**
 * スマホの今日やる行の一番上に出す 1 件: 始まっていて終わっていないもの（`now`）か、次に始まるもの（`next`）。
 * `timed` は時間を決めた今日やる行。予定（授業・バイト）は `tasks` からその日の時刻つきを、Google の予定は時刻つきを入れる。
 * 始まりの早い順（同じなら To-Do を先）。どれも無ければ null
 */
export function nowOrNextPlan(
  { timed, tasks, events, dateKey }: { timed: readonly Task[]; tasks: readonly Task[]; events: readonly CalendarEvent[]; dateKey: string },
  now: Date,
): NowNextPlan | null {
  const nowHm = clockOf(now)
  type Candidate = { start: string; plan: NowNextSource }
  const picks: Candidate[] = []
  for (const task of timed) {
    if (task.startTime && task.endTime && !planTiming(task, now).ended)
      picks.push({ start: task.startTime, plan: { source: 'task', task } })
  }
  for (const task of tasks) {
    if (!isActiveTask(task) || !isEventTask(task) || task.completed || !task.startTime || !task.endTime) continue
    if (taskPlacementDate(task) !== dateKey || planTiming(task, now).ended) continue
    picks.push({ start: task.startTime, plan: { source: 'event', task } })
  }
  for (const event of events) {
    if (event.isAllDay || event.date !== dateKey || !event.startTime || !event.endTime) continue
    // 0 時をまたぐ予定はその日のうちは終わらない
    if (event.endTime > event.startTime && event.endTime <= nowHm) continue
    picks.push({ start: event.startTime, plan: { source: 'google', event } })
  }
  // sort は同じ始まりなら入れた順（To-Do → 予定 → Google）のまま
  const first = picks.sort((a, b) => a.start.localeCompare(b.start))[0]
  if (!first) return null
  return { ...first.plan, kind: first.start <= nowHm ? 'now' : 'next' }
}

/**
 * 今日の計画の見出しに、その日の結果（時間に置いた予定のうちできた数・予定外の時間）を出すか。
 * 過ぎた日はいつも、今日は「1 日を締める」と同じ時刻（`wrapUpFromMinutes`）から。これからの日・今日の昼は出さない
 */
export function showsDayResult(dateKey: string, todayKey: string, nowMinutes: number, wrapUpFromMinutes: number): boolean {
  return dateKey < todayKey || (dateKey === todayKey && nowMinutes >= wrapUpFromMinutes)
}
