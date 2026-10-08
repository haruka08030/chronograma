import { isActiveTask } from './taskLifecycle'
import { isLogTask, type Task } from '../types/task'

/** 親の行で、題名・メモ・タグ（記録は分類を写している）に語を含むか。`q` は前後の空白を除いて小文字にしたもの */
function matches(t: Task, q: string): boolean {
  return (
    t.parentId === null &&
    isActiveTask(t) &&
    (t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q)))
  )
}

/**
 * 検索に当たる To-Do・予定（親の行だけ。題名・メモ・タグに含む）。記録・睡眠は入れない（`searchRecords` で別に出す。#288）。
 * 結果の一覧・検索欄の Enter（最初の結果を開く）・⌘K のパレットで共有する
 */
export function searchTasks(tasks: readonly Task[], query: string): Task[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return tasks.filter((t) => !isLogTask(t) && matches(t, q))
}

/** 記録の新しい順（始めた日・時刻） */
const recordStamp = (t: Task) => `${t.dueDate ?? ''}T${t.startTime ?? ''}`

/**
 * 検索に当たる記録（タイマー・後から入れた記録・睡眠）。新しい順。
 * 性質の違うものを混ぜないよう、検索結果では To-Do の行と分けて件数と「記録を見る」で出す（#288）
 */
export function searchRecords(tasks: readonly Task[], query: string): Task[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return tasks.filter((t) => isLogTask(t) && matches(t, q)).sort((a, b) => recordStamp(b).localeCompare(recordStamp(a)))
}
