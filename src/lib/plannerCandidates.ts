import type { Task } from '../types/task'
import { isRecord, oneOf, PRIORITY_ORDER, readTaskFilter, type TaskFilter } from './taskFilter'

/**
 * 今日やる候補の並び順。既定は優先度（何からやるか選ぶ場面なので重要な順）。`dueDate` は締切の日の見出しで分ける。
 * 締切順は以前 `due` で既定だった。保存済みの `due` は読めずに既定の優先度へ戻る（一度だけ優先度順に切り替えるため）
 */
export type CandidateSort = 'priority' | 'dueDate' | 'estimate' | 'createdAt'

/** 今日やる候補の並び順・絞り込み（画面の好みとして覚えておく） */
export interface CandidateView extends TaskFilter {
  sort: CandidateSort
}

export const DEFAULT_CANDIDATE_VIEW: CandidateView = {
  sort: 'priority',
  listId: null,
  color: null,
  tag: null,
  priority: null,
  estimate: null,
}

export const CANDIDATE_SORTS: readonly CandidateSort[] = ['priority', 'dueDate', 'estimate', 'createdAt']

/**
 * 締切順以外に並べ直す。同じなら締切の近い順（締切なしは後ろ）、それも同じなら渡した順。
 * `dueDate` は渡した順（締切間近 → その先 → 日付なし…）のまま
 */
export function sortCandidates(tasks: readonly Task[], sort: CandidateSort): Task[] {
  if (sort === 'dueDate') return [...tasks]
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

/** 保存した好みを読む。合わない値は既定に戻す */
export function readCandidateView(raw: unknown): CandidateView | null {
  if (!isRecord(raw)) return null
  return { sort: oneOf(CANDIDATE_SORTS, raw.sort) ?? DEFAULT_CANDIDATE_VIEW.sort, ...readTaskFilter(raw) }
}
