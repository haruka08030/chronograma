import type { Task } from '../types/task'
import type { TaskList } from '../types/list'

/** 優先度の絞り込み: `high` は高だけ、`medium` は中以上 */
export type PriorityFilter = 'high' | 'medium'
/** 見積もりの絞り込み: `set` は見積もりのあるもの、数字はその分以内 */
export type EstimateFilter = 'set' | 15 | 30 | 60

/**
 * To-Do の絞り込み（今日やる候補・To-Do 一覧・完了済みで共通）。`null` は指定なし。
 * 画面ごとに使う項目だけ持つ（To-Do 一覧は優先度・見積もりだけ、など）
 */
export interface TaskFilter {
  listId: string | null
  /** 色ラベル（`#RRGGBB` 大文字） */
  color: string | null
  tag: string | null
  priority: PriorityFilter | null
  estimate: EstimateFilter | null
}

export type TaskFilterKey = keyof TaskFilter

/** To-Do 一覧の絞り込み（リスト・ラベルは左のパネルで選ぶので、ここは優先度・見積もりだけ） */
export type TodoFilter = Pick<TaskFilter, 'priority' | 'estimate'>
export const TODO_FILTER_KEYS = ['priority', 'estimate'] as const satisfies readonly TaskFilterKey[]
export const NO_TODO_FILTER: TodoFilter = { priority: null, estimate: null }

/** 開いている画面に効く To-Do 一覧の絞り込み。いつか・チェックリストは優先度・見積もりを持たないので効かせない */
export function todoFilterFor(
  lists: readonly Pick<TaskList, 'id' | 'kind'>[],
  selectedListId: string | null,
  todoFilter: TodoFilter,
): TodoFilter | undefined {
  const kind = selectedListId ? (lists.find((l) => l.id === selectedListId)?.kind ?? 'tasks') : 'tasks'
  return kind === 'tasks' ? todoFilter : undefined
}

/** 優先度の並び（高いほど小さい） */
export const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 }

const TASK_FILTER_KEYS: readonly TaskFilterKey[] = ['listId', 'color', 'tag', 'priority', 'estimate']

export const PRIORITY_FILTERS: readonly PriorityFilter[] = ['high', 'medium']
export const ESTIMATE_FILTERS: readonly EstimateFilter[] = ['set', 15, 30, 60]

/** 絞り込みを 1 つでも選んでいるか（並び順など絞り込み以外の項目は見ない） */
export function hasTaskFilter(filter: Partial<TaskFilter>): boolean {
  return TASK_FILTER_KEYS.some((k) => filter[k] !== null && filter[k] !== undefined)
}

export function matchesTaskFilter(task: Task, filter: Partial<TaskFilter>): boolean {
  const { listId, color, tag, priority, estimate } = filter
  if (listId && task.listId !== listId) return false
  if (color && task.color?.toUpperCase() !== color) return false
  if (tag && !task.tags.includes(tag)) return false
  if (priority && (PRIORITY_ORDER[task.priority] ?? 3) > PRIORITY_ORDER[priority]) return false
  if (estimate !== null && estimate !== undefined) {
    if (task.estimateMinutes === null) return false
    if (estimate !== 'set' && task.estimateMinutes > estimate) return false
  }
  return true
}

export function filterTasks(tasks: readonly Task[], filter: Partial<TaskFilter>): Task[] {
  return hasTaskFilter(filter) ? tasks.filter((task) => matchesTaskFilter(task, filter)) : [...tasks]
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const stringOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
export const oneOf = <T>(table: readonly T[], v: unknown): T | null => (table.includes(v as T) ? (v as T) : null)

/** 保存した絞り込みを読む。合わない値は指定なしに戻す */
export function readTaskFilter(raw: Record<string, unknown>): TaskFilter {
  return {
    listId: stringOrNull(raw.listId),
    color: stringOrNull(raw.color)?.toUpperCase() ?? null,
    tag: stringOrNull(raw.tag),
    priority: oneOf(PRIORITY_FILTERS, raw.priority),
    estimate: oneOf(ESTIMATE_FILTERS, raw.estimate),
  }
}
