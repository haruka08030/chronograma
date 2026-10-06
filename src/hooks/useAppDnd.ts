import { useCallback, useRef, useState } from 'react'
import { MouseSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { TASK_PREFIX, type TaskRootDragData } from '../components/SortableTaskItem'
import { SUBTASK_PREFIX, parseSubtaskDragId } from '../lib/subtaskDnD'
import { canStartTimerFor, setTimerDragActive } from '../lib/timerDrop'
import { applyDragEnd } from '../lib/dragEnd'
import { AppTouchSensor } from '../lib/appTouchSensor'
import { isTouchLiftEvent } from '../lib/touchLift'
import { LONG_PRESS_MS } from './useLongPress'

export type DragOverlayTask = {
  taskId: string
  isSubtask: boolean
  count: number
  /** タッチの長押しで浮かせた（押さえている間に別の指で足すと件数が増える） */
  lift: boolean
}

/**
 * 画面全体の DndContext（To-Do の行・サブタスク・セクション・リストのドラッグ）に渡すもの。
 * `dragActiveRef` はタスク・リストをドラッグしている間 true（横に動かしてもドロワーを出さない）
 */
export function useAppDnd() {
  const [dragOverlayTask, setDragOverlayTask] = useState<DragOverlayTask | null>(null)
  const dragActiveRef = useRef(false)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // つまみ（`touch-none` の ⠿ ボタン）からは短い待ちで持ち上げる。
    // スマホの To-Do の行（つまみを出さない）は長押しで浮かせ、そのまま運べる（`AppTouchSensor`）
    useSensor(AppTouchSensor, { handleDelay: 140, liftDelay: LONG_PRESS_MS, tolerance: 8 }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    dragActiveRef.current = true
    const activeId = String(event.active.id)
    const group = (event.active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
    const count = group && group.length > 1 ? group.length : 1
    const lift = isTouchLiftEvent(event.activatorEvent)
    const draggedId = activeId.startsWith(TASK_PREFIX)
      ? activeId.slice(TASK_PREFIX.length)
      : activeId.startsWith(SUBTASK_PREFIX)
        ? parseSubtaskDragId(activeId)
        : null
    if (draggedId && canStartTimerFor(useTaskStore.getState().tasks.find((t) => t.id === draggedId))) {
      setTimerDragActive(true)
    }
    if (activeId.startsWith(TASK_PREFIX)) {
      setDragOverlayTask({ taskId: activeId.slice(TASK_PREFIX.length), isSubtask: false, count, lift })
      return
    }
    if (activeId.startsWith(SUBTASK_PREFIX)) {
      const taskId = parseSubtaskDragId(activeId)
      setDragOverlayTask(taskId ? { taskId, isSubtask: true, count: 1, lift } : null)
      return
    }
    setDragOverlayTask(null)
  }, [])

  const handleDragCancel = useCallback(() => {
    dragActiveRef.current = false
    setDragOverlayTask(null)
    setTimerDragActive(false)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    dragActiveRef.current = false
    setDragOverlayTask(null)
    setTimerDragActive(false)
    applyDragEnd(event)
  }, [])

  return { sensors, dragOverlayTask, dragActiveRef, handleDragStart, handleDragEnd, handleDragCancel }
}
