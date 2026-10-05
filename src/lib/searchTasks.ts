import { isActiveTask } from './taskLifecycle'
import type { Task } from '../types/task'

/** 検索に当たるタスク（親の行だけ。題名・メモ・タグに含む）。結果の一覧と、検索欄の Enter（最初の結果を開く）で共有する */
export function searchTasks(tasks: readonly Task[], query: string): Task[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return tasks.filter(
    (t) =>
      t.parentId === null &&
      isActiveTask(t) &&
      (t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q))),
  )
}
