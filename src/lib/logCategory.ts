import type { Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase()

function logStamp(t: Task): string {
  return `${t.dueDate ?? ''} ${t.startTime ?? ''} ${t.createdAt}`
}

/**
 * 分類を付けずに記録したときの推定（毎回選ばなくて済むように）。
 * 1. 元タスクのタグ（「今日の計画」の ▶ から始めた記録）
 * 2. 同じタイトルで前回付けた分類
 */
export function inferLogCategory(tasks: readonly Task[], title: string, sourceTaskId?: string | null): string | null {
  if (sourceTaskId) {
    const src = tasks.find((t) => t.id === sourceTaskId)
    if (src?.tags[0]) return src.tags[0]
  }
  const key = norm(title)
  if (!key) return null
  let best: Task | null = null
  for (const t of tasks) {
    if (!t.isTimeLog || !isActiveTask(t) || t.tags.length === 0 || norm(t.title) !== key) continue
    if (!best || logStamp(t) > logStamp(best)) best = t
  }
  return best?.tags[0] ?? null
}

export interface RecentLog {
  title: string
  category: string | null
}

/** 最近の記録（タイトルの重複を除いて新しい順）。「今日」画面のワンタップ再開用 */
export function recentLogs(tasks: readonly Task[], limit = 4): RecentLog[] {
  const logs = tasks
    .filter((t) => t.isTimeLog && isActiveTask(t) && t.title.trim())
    .sort((a, b) => logStamp(b).localeCompare(logStamp(a)))
  const seen = new Set<string>()
  const out: RecentLog[] = []
  for (const t of logs) {
    const key = norm(t.title)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ title: t.title, category: t.tags[0] ?? null })
    if (out.length >= limit) break
  }
  return out
}
