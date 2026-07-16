import type { Task } from '../types/task'

/** ゴミ箱（削除済み）にあるか */
export function isDeletedTask(t: Task): boolean {
  return typeof t.deletedAt === 'string' && t.deletedAt.length > 0
}

/** アーカイブ済み箱にあるか */
export function isArchivedTask(t: Task): boolean {
  return typeof t.archivedAt === 'string' && t.archivedAt.length > 0
}

/** 通常のビュー（一覧・カレンダー・ログ・統計・検索など）に出す対象か */
export function isActiveTask(t: Task): boolean {
  return !isDeletedTask(t) && !isArchivedTask(t)
}
