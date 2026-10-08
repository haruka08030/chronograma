import type { Task } from '../types/task'
import { PRIORITY_ORDER } from './mainListTasks'

/** 今日やる候補の並び順。`due` は締切の日の見出しで分ける（既定） */
export type CandidateSort = 'due' | 'priority' | 'estimate' | 'createdAt'
/** 優先度の絞り込み: `high` は高だけ、`medium` は中以上 */
export type CandidatePriority = 'high' | 'medium'
/** 見積もりの絞り込み: `set` は見積もりのあるもの、数字はその分以内 */
export type CandidateEstimate = 'set' | 15 | 30 | 60

/** 今日やる候補の並び順・絞り込み（画面の好みとして覚えておく） */
export interface CandidateView {
  sort: CandidateSort
  listId: string | null
  /** 色ラベル（`#RRGGBB` 大文字） */
  color: string | null
  tag: string | null
  priority: CandidatePriority | null
  estimate: CandidateEstimate | null
}

export const DEFAULT_CANDIDATE_VIEW: CandidateView = {
  sort: 'due',
  listId: null,
  color: null,
  tag: null,
  priority: null,
  estimate: null,
}

export const CANDIDATE_SORTS: readonly CandidateSort[] = ['due', 'priority', 'estimate', 'createdAt']
export const CANDIDATE_PRIORITIES: readonly CandidatePriority[] = ['high', 'medium']
export const CANDIDATE_ESTIMATES: readonly CandidateEstimate[] = ['set', 15, 30, 60]

/** 絞り込みを 1 つでも選んでいるか */
export function hasCandidateFilter(view: CandidateView): boolean {
  return view.listId !== null || view.color !== null || view.tag !== null || view.priority !== null || view.estimate !== null
}

export function filterCandidates(tasks: readonly Task[], view: CandidateView): Task[] {
  if (!hasCandidateFilter(view)) return [...tasks]
  const maxPriority = view.priority === 'high' ? PRIORITY_ORDER.high : view.priority === 'medium' ? PRIORITY_ORDER.medium : null
  return tasks.filter((task) => {
    if (view.listId !== null && task.listId !== view.listId) return false
    if (view.color !== null && task.color?.toUpperCase() !== view.color) return false
    if (view.tag !== null && !task.tags.includes(view.tag)) return false
    if (maxPriority !== null && (PRIORITY_ORDER[task.priority] ?? 3) > maxPriority) return false
    if (view.estimate !== null) {
      if (task.estimateMinutes === null) return false
      if (view.estimate !== 'set' && task.estimateMinutes > view.estimate) return false
    }
    return true
  })
}

/**
 * 締切順以外に並べ直す。同じなら締切の近い順（締切なしは後ろ）、それも同じなら渡した順。
 * `due` は渡した順（締切間近 → その先 → 日付なし…）のまま
 */
export function sortCandidates(tasks: readonly Task[], sort: CandidateSort): Task[] {
  if (sort === 'due') return [...tasks]
  const index = new Map(tasks.map((t, i) => [t.id, i]))
  const byDue = (a: Task, b: Task) => {
    if (a.dueDate === b.dueDate) return index.get(a.id)! - index.get(b.id)!
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.localeCompare(b.dueDate)
  }
  const key = (t: Task): number => {
    if (sort === 'priority') return PRIORITY_ORDER[t.priority] ?? 3
    // 見積もりなしは最後
    return t.estimateMinutes ?? Number.POSITIVE_INFINITY
  }
  return [...tasks].sort((a, b) => {
    if (sort === 'createdAt') return b.createdAt.localeCompare(a.createdAt) || byDue(a, b)
    return key(a) - key(b) || byDue(a, b)
  })
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const stringOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const oneOf = <T>(table: readonly T[], v: unknown): T | null => (table.includes(v as T) ? (v as T) : null)

/** 保存した好みを読む。合わない値は既定に戻す */
export function readCandidateView(raw: unknown): CandidateView | null {
  if (!isRecord(raw)) return null
  return {
    sort: oneOf(CANDIDATE_SORTS, raw.sort) ?? 'due',
    listId: stringOrNull(raw.listId),
    color: stringOrNull(raw.color)?.toUpperCase() ?? null,
    tag: stringOrNull(raw.tag),
    priority: oneOf(CANDIDATE_PRIORITIES, raw.priority),
    estimate: oneOf(CANDIDATE_ESTIMATES, raw.estimate),
  }
}
