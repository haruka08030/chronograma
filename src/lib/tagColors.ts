import type { Task } from '../types/task'

/** タイムログブロック・アクティビティサマリーなどで共有するパステルセット */
export type LogBlockAccent = {
  bg: string
  text: string
  border: string
}

export const TAG_COLORS: LogBlockAccent[] = [
  { bg: 'bg-blue-100 dark:bg-blue-500/20', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-500/30' },
  { bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-500/30' },
  { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-500/30' },
  { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-500/30' },
  { bg: 'bg-pink-100 dark:bg-pink-500/20', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-500/30' },
  { bg: 'bg-cyan-100 dark:bg-cyan-500/20', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-500/30' },
]

/** 予定 vs ログのログ列デフォルト（タグなし）。タイムラインの明るいエメラルドと揃える */
const EMERALD_LOG_ACCENT: LogBlockAccent = {
  border: 'border-emerald-300 dark:border-emerald-500/40',
  bg: 'bg-emerald-50 dark:bg-emerald-500/15',
  text: 'text-emerald-800 dark:text-emerald-200',
}

export function getTagColor(idx: number): LogBlockAccent {
  return TAG_COLORS[idx % TAG_COLORS.length]!
}

/** 全タスクからタイムログに付いたタグを収集（挿入順は ActivityLogView 従来どおり） */
export function timeLogTagUniverse(tasks: Task[]): string[] {
  const set = new Set<string>()
  for (const t of tasks) {
    if (t.isTimeLog) {
      for (const tag of t.tags) set.add(tag)
    }
  }
  return Array.from(set)
}

/**
 * 先頭タグが universe にあればパレット色、なければエメラルド（タグなし・未知タグ）。
 */
export function logBlockAccentFromTags(tags: string[], universe: string[]): LogBlockAccent {
  if (tags.length === 0) return EMERALD_LOG_ACCENT
  const tagIdx = universe.indexOf(tags[0]!)
  if (tagIdx < 0) return EMERALD_LOG_ACCENT
  return getTagColor(tagIdx)
}
