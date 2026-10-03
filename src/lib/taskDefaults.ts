import type { Task } from '../types/task'

/**
 * タスクの、無いときの値（どれも必ず持つ項目。値が無いことは null / false で表す）。
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
  color: null,
  isTimeLog: false,
  habitId: null,
  isSleep: false,
  archivedAt: null,
  deletedAt: null,
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
  return out ?? t
}
