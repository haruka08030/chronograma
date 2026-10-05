import type { Task } from '../types/task'
import type { TaskList } from '../types/list'

/**
 * 「予定・期限の対象外」のリスト ID（いつか / チェックリスト）。
 * 今日・近日中・期限切れ・すべて・今日の計画・統計・週のふりかえり・期限通知はここに入るタスクを数えない。
 */
export function unplannedListIds(lists: readonly TaskList[]): Set<string> {
  return new Set(lists.filter((l) => l.kind === 'someday' || l.kind === 'checklist').map((l) => l.id))
}

/** 予定・締切として扱うタスクか（いつか・チェックリストのリストに入っていない） */
export function isPlannableTask(task: Pick<Task, 'listId'>, excluded: ReadonlySet<string>): boolean {
  return !excluded.has(task.listId)
}

/** クイック追加の `@名前` からリストを探す（大文字小文字・全角半角の空白は無視。未分類は表示名でも一致） */
export function findListByName(lists: readonly TaskList[], name: string, displayName: (list: TaskList) => string): TaskList | null {
  const key = name.normalize('NFKC').trim().toLowerCase()
  if (!key) return null
  const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase()
  return (
    lists.find((l) => norm(l.name) === key || norm(displayName(l)) === key) ??
    lists.find((l) => norm(l.name).startsWith(key) || norm(displayName(l)).startsWith(key)) ??
    null
  )
}
