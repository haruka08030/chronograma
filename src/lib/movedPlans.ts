/**
 * 予定日を移した To-Do の元の予定（#158）。その日が来てから（今日・過ぎた日の予定を）別の日へ移したときだけ、
 * 元の日・時刻と移した先を `movedPlans` に残す。先の日どうしの付け替えは予定を立て直しただけなので残さない。
 * 過ぎた日のタイムラインに控えを出し、「計画どおり実行」の分母に入れる（`weekReview.ts`）
 */
import { isTodoTask, type MovedPlan, type Task } from '../types/task'
import type { PlannedItem } from '../types/plannedItem'
import { isActiveTask } from './taskLifecycle'

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

/**
 * 予定日を `nextDate` に変えたあとの控え。今日・過ぎた日の未完了の To-Do を別の日へ移したら元の予定を足す。
 * 控えのある日へ戻したら、その日の控えは消す（予定どおりの日に戻った）
 */
export function movedPlansAfter(task: Task, nextDate: string | null, todayKey: string): MovedPlan[] | undefined {
  const from = task.scheduledDate
  const plans = task.movedPlans ?? []
  if (!nextDate || from === nextDate) return task.movedPlans
  const kept = plans.filter((p) => p.date !== nextDate)
  if (!from || from > todayKey || !isTodoTask(task) || task.completed || task.parentId) {
    return kept.length === plans.length ? task.movedPlans : kept
  }
  const entry: MovedPlan = { date: from, startTime: task.startTime, endTime: task.endTime, to: nextDate }
  // 同じ日から何度か移したら、最後の行き先だけ
  return [...kept.filter((p) => p.date !== from), entry].slice(-MAX_MOVED_PLANS)
}

/** その日から移した予定（To-Do と控え）。消した・アーカイブした To-Do・いつか / チェックリストのものは入れない */
export function movedPlansOnDay(
  tasks: readonly Task[],
  key: string,
  excludedListIds: ReadonlySet<string> = new Set(),
): { task: Task; plan: MovedPlan }[] {
  const out: { task: Task; plan: MovedPlan }[] = []
  for (const task of tasks) {
    if (!task.movedPlans || !isActiveTask(task) || excludedListIds.has(task.listId)) continue
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
    source: 'scheduled-task',
    taskId: task.id,
    completed: false,
  }
}

/**
 * 過ぎた日の一行「予定 n・できた n・持ち越し n」の数。予定はその日に置いた To-Do（親だけ）と、その日から移した予定。
 * できたはその日に置いて完了した To-Do、持ち越しはその日から移した予定
 */
export function dayPlanTally(
  tasks: readonly Task[],
  key: string,
  excludedListIds: ReadonlySet<string> = new Set(),
): { planned: number; done: number; carried: number } {
  let placed = 0
  let done = 0
  for (const t of tasks) {
    if (t.scheduledDate !== key || t.parentId || !isTodoTask(t) || !isActiveTask(t) || excludedListIds.has(t.listId)) continue
    placed++
    if (t.completed) done++
  }
  const carried = movedPlansOnDay(tasks, key, excludedListIds).filter(({ task }) => !task.parentId).length
  return { planned: placed + carried, done, carried }
}
