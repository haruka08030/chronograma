/**
 * 動かした予定の元の位置（#158・#682）。始まってから（時刻のある予定は開始を過ぎてから、時刻の無い To-Do はその日が来てから）
 * 別の日へ移した・同じ日の別の時刻へずらしたときだけ、元の日・時刻と移した先を `movedPlans` に残す。始まる前の組み直しは残さない。
 * 始まってから消した（ゴミ箱へ）予定は `planTraces` が「やめた」として足す。
 * タイムラインの元の位置に点線の枠を出し、「計画どおり実行」の分母に入れる（`weekReview.ts`）
 */
import { isEventTask, isTodoTask, type MovedPlan, type Task } from '../types/task'
import type { PlannedItem } from '../types/plannedItem'
import { isActiveTask, isArchivedTask, isDeletedTask } from './taskLifecycle'
import { wallMinutes, wallMinutesOf } from './wallTime'
import { toAppWall } from './timeZone'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^\d{2}:\d{2}$/
/** 1 つの To-Do に残す数（古いものから捨てる） */
export const MAX_MOVED_PLANS = 30

/** サーバー・バックアップの値を読む。形の合わないものは捨てる。1 つも無ければ null */
export function readMovedPlans(raw: unknown): MovedPlan[] | null {
  if (!Array.isArray(raw)) return null
  const out: MovedPlan[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    if (typeof r.date !== 'string' || !DATE_KEY.test(r.date) || typeof r.to !== 'string' || !DATE_KEY.test(r.to)) continue
    const timed = typeof r.startTime === 'string' && CLOCK.test(r.startTime) && typeof r.endTime === 'string' && CLOCK.test(r.endTime)
    out.push({ date: r.date, startTime: timed ? (r.startTime as string) : null, endTime: timed ? (r.endTime as string) : null, to: r.to })
  }
  return out.length > 0 ? out.slice(-MAX_MOVED_PLANS) : null
}

/** 控えのある行だけ項目を持つ形（無いときは項目ごと持たない。同期で「変わった」と見ないため） */
export function withMovedPlans<T extends Task>(t: T, plans: readonly MovedPlan[] | null | undefined): T {
  if (plans && plans.length > 0) return { ...t, movedPlans: [...plans] }
  if (!('movedPlans' in t)) return t
  const rest = { ...t }
  delete rest.movedPlans
  return rest
}

/** 動かした先（予定日と時刻） */
export type PlanSlot = { date: string | null; startTime: string | null; endTime: string | null }

/** 跡を残す種類か（予定と、完了していない To-Do。子は除く） */
function tracksPlan(task: Task): boolean {
  if (task.parentId) return false
  return isEventTask(task) || (isTodoTask(task) && !task.completed)
}

/** その予定が始まったか（時刻の無いものはその日の 0:00） */
function startedBy(date: string, startTime: string | null, nowWall: number): boolean {
  return wallMinutes(date, startTime ?? '00:00') <= nowWall
}

/**
 * 予定日・時刻を `next` に変えたあとの控え。始まった予定を別の日・同じ日の別の時刻へ動かしたら元の予定を足す
 * （同じ日から何度動かしても、元の時刻は最初のまま・行き先だけ新しく）。元の日・時刻へ戻したら、その控えは消す。
 * `nowWall` はアプリのタイムゾーンの壁時計の通しの分（`wallMinutesOf`）
 */
export function movedPlansAfter(task: Task, next: PlanSlot, nowWall: number): MovedPlan[] | undefined {
  const from = task.scheduledDate
  const plans = task.movedPlans ?? []
  if (!next.date) return task.movedPlans
  const sameDay = from === next.date
  const timed = !!(next.startTime && next.endTime)
  if (sameDay && (task.startTime === next.startTime || !timed || !task.startTime)) return task.movedPlans
  // 元の日（時刻の無い控えは日だけ）・元の時刻へ戻ったら、その控えは予定どおりに戻った
  const kept = plans.filter(
    (p) => !(p.date === next.date && (!p.startTime || (p.startTime === next.startTime && p.endTime === next.endTime))),
  )
  if (sameDay && kept.length !== plans.length) return kept
  const prior = from ? kept.find((p) => p.date === from) : undefined
  if (!from || !tracksPlan(task) || (!prior && !startedBy(from, task.startTime, nowWall))) {
    return kept.length === plans.length ? task.movedPlans : kept
  }
  const entry: MovedPlan = prior
    ? { ...prior, to: next.date }
    : { date: from, startTime: task.startTime, endTime: task.endTime, to: next.date }
  return [...kept.filter((p) => p.date !== from), entry].slice(-MAX_MOVED_PLANS)
}

/** 元の位置の跡 1 つ。`to` が null は始まってから消した（やめた）予定 */
export type PlanTrace = Omit<MovedPlan, 'to'> & { to: string | null }

/** 始まってから消した（ゴミ箱へ入れた）時刻つきの予定か */
export function cancelledAfterStart(task: Task): boolean {
  if (!isDeletedTask(task) || isArchivedTask(task) || !tracksPlan(task)) return false
  if (!task.scheduledDate || !task.startTime || !task.endTime) return false
  return startedBy(task.scheduledDate, task.startTime, wallMinutesOf(toAppWall(task.deletedAt!)))
}

/**
 * 1 つの予定の元の位置の跡（動かした控えと、始まってから消したならその位置）。アーカイブした・始まる前に消したものは無し
 */
export function planTraces(task: Task): PlanTrace[] {
  if (isActiveTask(task)) return task.movedPlans ?? []
  if (!cancelledAfterStart(task)) return []
  return [...(task.movedPlans ?? []), { date: task.scheduledDate!, startTime: task.startTime, endTime: task.endTime, to: null }]
}

/**
 * その日から動かした予定（To-Do・予定と控え）。消した・アーカイブしたもの・いつか / チェックリストのものは入れない。
 * 同じ日の中でずらしたものは今の時刻の予定として数えるので入れない
 */
export function movedPlansOnDay(
  tasks: readonly Task[],
  key: string,
  excludedListIds: ReadonlySet<string> = new Set(),
): { task: Task; plan: MovedPlan }[] {
  const out: { task: Task; plan: MovedPlan }[] = []
  for (const task of tasks) {
    if (!task.movedPlans || !isActiveTask(task) || excludedListIds.has(task.listId)) continue
    if (task.scheduledDate === key) continue
    for (const plan of task.movedPlans) if (plan.date === key) out.push({ task, plan })
  }
  return out
}

/** 移した時刻つきの予定を、突き合わせの予定にする（完了していない予定として数える） */
export function movedPlanToPlannedItem(task: Task, plan: MovedPlan): PlannedItem | null {
  if (!plan.startTime || !plan.endTime) return null
  return {
    id: `moved::${task.id}::${plan.date}`,
    summary: task.title,
    startTime: plan.startTime,
    endTime: plan.endTime,
    source: isEventTask(task) ? 'scheduled-event' : 'scheduled-task',
    taskId: task.id,
    completed: false,
  }
}
