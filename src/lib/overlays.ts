import { create } from 'zustand'

/**
 * タスクの詳細と右クリックメニューの開閉（どの画面から開いても、App に 1 つだけある置き場が出す）。
 * 画面ごとに開閉の状態と描画を持つと、出し忘れ・二重に開く・閉じ方の違いが起きる
 */
export type TaskMenuRequest =
  | { kind: 'task'; x: number; y: number; taskIds: string[]; above?: boolean; onDone?: () => void }
  | { kind: 'event'; x: number; y: number; taskId: string }
  | { kind: 'google'; x: number; y: number; eventId: string }

type OverlayState = {
  detailTaskId: string | null
  menu: TaskMenuRequest | null
}

export const useOverlays = create<OverlayState>(() => ({ detailTaskId: null, menu: null }))

export function openTaskDetail(taskId: string) {
  useOverlays.setState({ detailTaskId: taskId, menu: null })
}

export function closeTaskDetail() {
  useOverlays.setState({ detailTaskId: null })
}

export function openTaskMenu(menu: TaskMenuRequest) {
  useOverlays.setState({ menu })
}

export function closeTaskMenu() {
  useOverlays.setState({ menu: null })
}
