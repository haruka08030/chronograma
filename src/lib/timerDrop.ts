import { useSyncExternalStore } from 'react'
import { useTaskStore } from '../store/taskStore'
import { logLabelFromTask } from './logCategoryColors'
import { isLogTask, type Task } from '../types/task'

/**
 * ToDo をつかんでいる間だけ出す「ここに落として計測開始」の共有状態。
 * つかみ方は 3 系統（ネイティブ D&D・dnd-kit・週タイムラインのポインタドラッグ）あるので、
 * どこからでも同じ落とし先を光らせられるよう、状態はモジュールに置く。
 */
interface TimerDropState {
  active: boolean
  over: boolean
}

let state: TimerDropState = { active: false, over: false }
const subscribers = new Set<() => void>()

function patch(next: Partial<TimerDropState>) {
  const merged = { ...state, ...next }
  if (merged.active === state.active && merged.over === state.over) return
  state = merged
  subscribers.forEach((f) => f())
}

export function setTimerDragActive(active: boolean) {
  patch(active ? { active } : { active, over: false })
}

export function setTimerDropHover(over: boolean) {
  patch({ over })
}

export function getTimerDrop(): TimerDropState {
  return state
}

export function useTimerDrop(): TimerDropState {
  return useSyncExternalStore(
    (f) => {
      subscribers.add(f)
      return () => {
        subscribers.delete(f)
      }
    },
    () => state,
  )
}

/** dnd-kit の落とし先 id */
export const TIMER_DROP_ID = 'timer-drop'

/** 落とし先に付ける属性（ポインタドラッグは座標からこれを探す） */
export const TIMER_DROP_ATTR = 'data-timer-drop'

export function isOverTimerDrop(clientX: number, clientY: number): boolean {
  return !!document.elementFromPoint(clientX, clientY)?.closest(`[${TIMER_DROP_ATTR}]`)
}

/** 記録・睡眠・済んだ ToDo は「これからやる」ものではないので計測の対象にしない */
export function canStartTimerFor(task: Task | undefined | null): task is Task {
  return !!task && !isLogTask(task) && !task.completed && !task.deletedAt
}

export function startTimerForTask(taskId: string): boolean {
  const { tasks, startTimer, timeLogTagPresets, logCategoryColors } = useTaskStore.getState()
  const task = tasks.find((t) => t.id === taskId)
  if (!canStartTimerFor(task)) return false
  const label = logLabelFromTask(task, timeLogTagPresets, logCategoryColors)
  startTimer(task.title, label.tags, task.id, label.color)
  return true
}
