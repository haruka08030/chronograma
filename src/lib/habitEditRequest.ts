import { useSyncExternalStore } from 'react'

/**
 * ほかの画面（タイムラインの習慣のカード・メニュー）から、習慣の編集を開く。画面は移らず、開いている画面の上に出す
 * （`HabitEditHost`）。`seq` は開き直すたびに増やし、中身を作り直す
 */
export type HabitEditTarget = { habitId: string; seq: number }

let target: HabitEditTarget | null = null
const listeners = new Set<() => void>()

function emit(next: HabitEditTarget | null) {
  target = next
  for (const l of listeners) l()
}

export function requestHabitEdit(habitId: string) {
  emit({ habitId, seq: (target?.seq ?? 0) + 1 })
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
