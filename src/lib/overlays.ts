import { create } from 'zustand'
import { isEventTask, isLogTask, type Task } from '../types/task'

/**
 * タスクの詳細と右クリックメニューの開閉（どの画面から開いても、App に 1 つだけある置き場が出す）。
 * 画面ごとに開閉の状態と描画を持つと、出し忘れ・二重に開く・閉じ方の違いが起きる
 */
export type TaskMenuRequest =
  /** `quick`: 指で行を押したときの短いシート（よく使う操作と「詳細を開く」だけ） */
  | { kind: 'task'; x: number; y: number; taskIds: string[]; above?: boolean; quick?: boolean; onDone?: () => void }
  /** `brief`: タイムラインの右クリック・長押し（完了 / 未完了・複製だけ） */
  | { kind: 'event'; x: number; y: number; taskId: string; brief?: boolean }
  /** 時間未定のタスクの「時間を決める」（空き時間の候補） */
  | { kind: 'timeSlot'; x: number; y: number; taskId: string; dateKey: string }
  /** `brief`: タイムラインの右クリック・長押し（コピーだけ） */
  | { kind: 'google'; x: number; y: number; eventId: string; brief?: boolean }
  /** 締切の「日時を指定…」（日付と時刻を一度に選ぶ） */
  | { kind: 'dueDateTime'; x: number; y: number; taskIds: string[]; onDone?: () => void }

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

/**
 * カレンダー（月のマス・終日の行・スケジュール・日のパネル）の行の右クリック・長押しのメニュー。
 * 予定・記録は予定のメニュー（`TaskEventMenu`。記録は色・編集・削除）、To-Do は時刻の有無によらず To-Do のメニュー
 */
export function openCalendarItemMenu(task: Pick<Task, 'id' | 'kind'>, x: number, y: number) {
  openTaskMenu(isEventTask(task) || isLogTask(task) ? { kind: 'event', x, y, taskId: task.id } : { kind: 'task', x, y, taskIds: [task.id] })
}
