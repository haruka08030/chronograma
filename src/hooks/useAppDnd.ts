import { useCallback, useRef, useState } from 'react'
import { MouseSensor, TouchSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { TASK_PREFIX, type TaskRootDragData } from '../components/SortableTaskItem'
import { SUBTASK_PREFIX, parseSubtaskDragId } from '../lib/subtaskDnD'
import { canStartTimerFor, setTimerDragActive } from '../lib/timerDrop'
import { applyDragEnd } from '../lib/dragEnd'

export type DragOverlayTask = { taskId: string; isSubtask: boolean; count: number }

/**
 * 画面全体の DndContext（To-Do の行・サブタスク・セクション・リストのドラッグ）に渡すもの。
 * `dragActiveRef` はタスク・リストをドラッグしている間 true（横に動かしてもドロワーを出さない）
 */
export function useAppDnd() {
  const [dragOverlayTask, setDragOverlayTask] = useState<DragOverlayTask | null>(null)
  const dragActiveRef = useRef(false)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // ドラッグはどれも専用のつまみ（`touch-none` の ⋮⋮ ボタン）からしか始まらないので、
    // タップとの判別に長い待ちは要らない。長押しの一括選択は行側（450ms）で別に拾う
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 8 } }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    dragActiveRef.current = true
    const activeId = String(event.active.id)
    const group = (event.active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
    const count = group && group.length > 1 ? group.length : 1
    const draggedId = activeId.startsWith(TASK_PREFIX)
      ? activeId.slice(TASK_PREFIX.length)
      : activeId.startsWith(SUBTASK_PREFIX)
        ? parseSubtaskDragId(activeId)
        : null
    if (draggedId && canStartTimerFor(useTaskStore.getState().tasks.find((t) => t.id === draggedId))) {
      setTimerDragActive(true)
    }
    if (activeId.startsWith(TASK_PREFIX)) {
      setDragOverlayTask({ taskId: activeId.slice(TASK_PREFIX.length), isSubtask: false, count })
      return
    }
    if (activeId.startsWith(SUBTASK_PREFIX)) {
      const taskId = parseSubtaskDragId(activeId)
      setDragOverlayTask(taskId ? { taskId, isSubtask: true, count: 1 } : null)
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
