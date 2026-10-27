import { useSyncExternalStore } from 'react'

/**
 * ほかの画面（タイムラインの習慣のカード・メニュー・今日の計画の習慣の行）から、習慣の詳細・編集を開く。画面は移らず、
 * 開いている画面の上に出す（`HabitEditHost`）。`seq` は開き直すたびに増やし、中身を作り直す。
 * `dateKey` はタイムラインで押した日（編集画面の上に、その日の時間を直す欄を出す、#621）。`edit` が false なら詳細から開く
 */
export type HabitEditTarget = { habitId: string; dateKey: string | null; edit: boolean; seq: number }

let target: HabitEditTarget | null = null
const listeners = new Set<() => void>()

function emit(next: HabitEditTarget | null) {
  target = next
  for (const l of listeners) l()
}

export function requestHabitEdit(habitId: string, dateKey: string | null = null) {
  emit({ habitId, dateKey, edit: true, seq: (target?.seq ?? 0) + 1 })
}

/** 習慣の詳細（連続・達成率・月のカレンダー・編集・休む…）を開く */
export function requestHabitDetail(habitId: string) {
  emit({ habitId, dateKey: null, edit: false, seq: (target?.seq ?? 0) + 1 })
}

export function closeHabitEdit() {
  if (target) emit(null)
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** 開いている編集（無ければ null） */
export function useHabitEditTarget(): HabitEditTarget | null {
  return useSyncExternalStore(
    subscribe,
    () => target,
    () => null,
  )
}
