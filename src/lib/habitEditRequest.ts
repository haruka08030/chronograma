import { useTaskStore } from '../store/taskStore'
import { requestAction, usePendingAction } from './pendingAction'

/** ほかの画面（タイムラインの習慣のカード・メニュー）から、習慣の画面でその習慣の編集を開く */
const ACTION = 'edit-habit'
let pendingHabitId: string | null = null

export function requestHabitEdit(habitId: string) {
  pendingHabitId = habitId
  useTaskStore.getState().selectView('habits')
  requestAction(ACTION)
}

/** 習慣の画面で受け取る（画面が出たとき・出ている間に頼まれたとき） */
export function useHabitEditRequest(open: (habitId: string) => void) {
  usePendingAction(ACTION, () => {
    const id = pendingHabitId
    pendingHabitId = null
    if (id) open(id)
  })
}
