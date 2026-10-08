import { isLogTask, isSleepTask, isTodoTask, type Task } from '../types/task'
import { completionDayKey } from './dayPlan'
import { isDeletedTask } from './taskLifecycle'
import { durationMinutesForTaskSlot } from './taskTimeRange'
import { appDayKeyOf, zonedNow } from './timeZone'
import { toDateKey } from './dateKey'
import { reviewPeriodDays, type ReviewPeriod } from './reviewPeriod'

/**
 * 見積もり（`estimateMinutes`）と、その To-Do に実際に記録した時間を並べる（#297）。
 *
 * 記録と To-Do の結び付け:
 * 1. ▶ で始めた記録は元の To-Do の id（`sourceTaskId`, #284）を持つ。これを正とする
 * 2. それより前の記録（`sourceTaskId` が無い）は、次の全部を満たすときだけ題名で結ぶ（控えめに。迷うものは結ばない）
 *    - 題名が To-Do と完全に同じ（前後の空白は無視）
 *    - その題名の To-Do が 1 つだけ（繰り返しの回・同じ名前の To-Do があると、どれの記録か決められない）
 *    - 記録の開始日が、To-Do を作った日から完了した日（未完了なら今日まで）の間
 *    - 習慣の記録（`habitId`）ではない
 *
 * 記録は日をまたいで・何日かに分けても全部足す（週で切らない。1 つの To-Do にかかった時間）。
 * 睡眠・削除した記録・子の記録は入れない（週のふりかえりの記録時間と同じ）
 */

/** 結び付けの対象にする記録（睡眠・削除・子は入れない） */
function isCountedLog(t: Task): boolean {
  return isLogTask(t) && !isSleepTask(t) && !isDeletedTask(t) && !t.parentId && t.startTime != null && t.endTime != null
}

/** 題名を比べる形（前後の空白を落とす） */
const titleKey = (title: string) => title.trim()

/**
 * To-Do の id → 結び付いた記録の合計（分）。結び付いた記録が無い To-Do は入らない。
 * `todayKey` は未完了の To-Do で、題名で結ぶ記録の終わりの日にする
 */
export function loggedMinutesByTask(tasks: readonly Task[], todayKey: string = toDateKey(zonedNow())): Map<string, number> {
  return new Map([...linkLogsToTasks(tasks, todayKey)].map(([id, x]) => [id, x.minutes]))
}

interface LinkedLogs {
  minutes: number
  /** 結び付いた記録のうちいちばん長いもの（棒の色をこの記録のラベルの色にする） */
  mainLog: Task
  mainMinutes: number
}

/** To-Do の id → 結び付いた記録の合計と、いちばん長い記録 */
function linkLogsToTasks(tasks: readonly Task[], todayKey: string): Map<string, LinkedLogs> {
  const todos = new Map<string, Task>()
  // 題名 → その題名の To-Do（2 つ以上なら null＝どれか決められない）
  const byTitle = new Map<string, Task | null>()
  for (const t of tasks) {
    if (!isTodoTask(t) || isDeletedTask(t)) continue
    todos.set(t.id, t)
    const key = titleKey(t.title)
    if (!key) continue
    byTitle.set(key, byTitle.has(key) ? null : t)
  }

  const out = new Map<string, LinkedLogs>()
  for (const log of tasks) {
    if (!isCountedLog(log)) continue
    let todo: Task | undefined
    if (log.sourceTaskId) {
      // 元の To-Do が分かっている記録は題名では結ばない（元を消したなら、その記録はどれにも足さない）
      todo = todos.get(log.sourceTaskId)
    } else if (!log.habitId) {
      const candidate = byTitle.get(titleKey(log.title))
      if (candidate && log.dueDate) {
        const from = appDayKeyOf(candidate.createdAt)
        const to = candidate.completed ? completionDayKey(candidate) : todayKey
        if (log.dueDate >= from && log.dueDate <= to) todo = candidate
      }
    }
    if (!todo) continue
    const min = durationMinutesForTaskSlot(log) ?? 0
    if (min <= 0) continue
    const cur = out.get(todo.id)
    if (!cur) out.set(todo.id, { minutes: min, mainLog: log, mainMinutes: min })
    else {
      cur.minutes += min
      if (min > cur.mainMinutes) {
        cur.mainLog = log
        cur.mainMinutes = min
      }
    }
  }
  return out
}

/** 1 つの To-Do に記録した時間の合計（分）。結び付いた記録が無ければ 0 */
export function loggedMinutesForTask(tasks: readonly Task[], taskId: string, todayKey?: string): number {
  return loggedMinutesByTask(tasks, todayKey).get(taskId) ?? 0
}

export interface EstimateRow {
  task: Task
  estimateMinutes: number
  loggedMinutes: number
  /** 結び付いた記録のうちいちばん長いもの（棒の色はこの記録のラベルの色） */
  mainLog: Task
}

/** ふりかえりに出す見積もりと記録の行数 */
export const ESTIMATE_ROWS = 5

/**
 * `anchor` を含む期間（週: 月曜始まり / 月: 暦の月、今日まで）に完了した To-Do のうち、見積もりがあって記録も結び付いているもの。
 * 見積もりを超えた分の大きい順（大きく超えたものが先頭。超えていないものは後ろ）。
 * 決めた後（完了した To-Do）だけを見る。いつか・チェックリストのリスト（`excludedListIds`）は入れない
 */
export function getEstimateRows(
  tasks: readonly Task[],
  anchor: Date,
  excludedListIds: ReadonlySet<string> = new Set(),
  now = zonedNow(),
  period: ReviewPeriod = 'week',
): EstimateRow[] {
  const todayKey = toDateKey(now)
  const days = reviewPeriodDays(period, anchor)
  const from = toDateKey(days[0]!)
  const periodEnd = toDateKey(days[days.length - 1]!)
  const to = periodEnd < todayKey ? periodEnd : todayKey
  const linked = linkLogsToTasks(tasks, todayKey)

  const rows: EstimateRow[] = []
  for (const t of tasks) {
    if (!isTodoTask(t) || !t.completed || isDeletedTask(t) || excludedListIds.has(t.listId)) continue
    if (t.estimateMinutes == null || t.estimateMinutes <= 0) continue
    const day = completionDayKey(t)
    if (day < from || day > to) continue
    const l = linked.get(t.id)
    if (!l) continue
    rows.push({ task: t, estimateMinutes: t.estimateMinutes, loggedMinutes: l.minutes, mainLog: l.mainLog })
  }
  return rows.sort(
    (a, b) => b.loggedMinutes - b.estimateMinutes - (a.loggedMinutes - a.estimateMinutes) || b.loggedMinutes - a.loggedMinutes,
  )
}
