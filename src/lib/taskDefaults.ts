import { isLogTask, type Task } from '../types/task'

/**
 * タスクの、無いときの値（どれも必ず持つ項目。値が無いことは null で表し、種類は To-Do）。
 * タスクを作る所（連携の取り込み・CSV など）と、前の版の保存・バックアップを読む所でそろえる
 */
export const TASK_DEFAULTS = {
  dueTime: null,
  scheduledDate: null,
  endDate: null,
  timeZone: null,
  timeZoneAnchor: null,
  reminders: null,
  location: null,
  estimateMinutes: null,
  sourceTaskId: null,
  color: null,
  kind: 'todo',
  habitId: null,
  archivedAt: null,
  deletedAt: null,
  category: null,
} satisfies Partial<Task>

/** 前の版の保存・バックアップのタスクで、無い（undefined の）項目を既定値で埋める */
export function withTaskDefaults(t: Task): Task {
  let out: Task | null = null
  for (const [k, v] of Object.entries(TASK_DEFAULTS)) {
    if ((t as unknown as Record<string, unknown>)[k] === undefined) {
      out ??= { ...t }
      ;(out as unknown as Record<string, unknown>)[k] = v
    }
  }
  return withLogCategory(out ?? t)
}

/**
 * 記録の分類をそろえる。正は `category`（無ければ前の版の書き方の tags の先頭）で、tags にも同じ名前を 1 つだけ写す
 * （まだ更新していない端末が tags の先頭を分類として読むため）。To-Do は category を持たない。
 * 何も変わらなければ同じオブジェクト
 */
export function withLogCategory(t: Task): Task {
  if (!isLogTask(t)) return t.category == null ? t : { ...t, category: null }
  const category = t.category ?? t.tags[0] ?? null
  const same = category === t.category && (category ? t.tags.length === 1 && t.tags[0] === category : t.tags.length === 0)
  return same ? t : { ...t, category, tags: category ? [category] : [] }
}
