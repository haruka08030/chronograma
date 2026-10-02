import type { Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'

export interface TodoLabel {
  name: string
  /** 未完了のルートタスク数（ラベルを開いたときの「未完了 n 件」と揃える） */
  count: number
}

/**
 * To‑Do のナビに出すラベル一覧（名前順）。
 * ラベルを開くと「すべて」をそのラベルで絞るので、範囲も「すべて」と同じにする:
 * 記録（分類として tags を使う）と、いつか・チェックリストのリストは入れない。
 * 完了済みしか残っていないラベルも、開いている途中で消えないよう 0 件で残す。
 */
export function todoLabels(tasks: Task[], excludedListIds: ReadonlySet<string>): TodoLabel[] {
  const counts = new Map<string, number>()
  for (const t of tasks) {
    if (t.isTimeLog || t.parentId !== null || !isActiveTask(t) || excludedListIds.has(t.listId)) continue
    for (const tag of t.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + (t.completed ? 0 : 1))
    }
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}
