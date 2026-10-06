import { useMemo, useState, useRef, useCallback, type RefObject } from 'react'
import { useDndMonitor, type DragCancelEvent, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { TASK_PREFIX, type TaskRootDragData } from '../components/SortableTaskItem'
import { SUBTASK_PREFIX, parseSubtaskDragId } from '../lib/subtaskDnD'
import { isIndentIntent } from '../lib/taskDragIntent'
import { getIndentTargetId } from '../lib/taskDepth'
import { DRAGSEC_PREFIX } from '../lib/sectionReorderDnD'
import { isTouchLiftEvent } from '../lib/touchLift'
import { useLiftHeld } from './useTouchLift'

/**
 * To-Do 一覧のドラッグの見張り。字下げ（ネスト）の案内を出す親と、タスクをドラッグ中かを返す。
 * `clearSelectionRef` は選択の解除（選択はこのフックより後に作るので参照で受ける）。
 * タッチの長押しで浮かせたドラッグ（`isTouchLiftEvent`）は、浮かせた行を選択に入れて今の選択ごと運ぶので、始めに選択を外さない。
 * 動かさずに離したら（onDragCancel）選んだ状態を残し、運んで離したら外す
 */
export function useTaskListDnd(clearSelectionRef: RefObject<() => void>) {
  const [previewParentId, setPreviewParentId] = useState<string | null>(null)
  const previewParentIdRef = useRef<string | null>(null)

  const clearNestPreview = useCallback(() => {
    if (previewParentIdRef.current === null) return
    previewParentIdRef.current = null
    setPreviewParentId(null)
  }, [])

  const updateNestPreview = useCallback((next: string | null) => {
    if (previewParentIdRef.current === next) return
    previewParentIdRef.current = next
    setPreviewParentId(next)
  }, [])

  /** タスクをドラッグ中か。空の「セクションなし」は、セクションの外へ戻す落とし先としてこの間だけ出す */
  const [taskDragging, setTaskDragging] = useState(false)

  const dndMonitor = useMemo(
    () => ({
      onDragStart({ active, activatorEvent }: DragStartEvent) {
        clearNestPreview()
        const id = String(active.id)
        const lift = isTouchLiftEvent(activatorEvent)
        setTaskDragging(id.startsWith(TASK_PREFIX) || id.startsWith(SUBTASK_PREFIX))
        if (id.startsWith(DRAGSEC_PREFIX)) {
          clearSelectionRef.current()
          return
        }
        if (id.startsWith(SUBTASK_PREFIX)) {
          clearSelectionRef.current()
          return
        }
        if (id.startsWith(TASK_PREFIX) && !lift) {
          const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
          if (!group || group.length <= 1) clearSelectionRef.current()
        }
      },
      onDragMove({ active, delta }: DragMoveEvent) {
        const id = String(active.id)
        if (!id.startsWith(TASK_PREFIX) && !id.startsWith(SUBTASK_PREFIX)) {
          updateNestPreview(null)
          return
        }
        const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
        if (group && group.length > 1) {
          updateNestPreview(null)
          return
        }
        const taskId = id.startsWith(SUBTASK_PREFIX) ? parseSubtaskDragId(id) : id.slice(TASK_PREFIX.length)
        if (!taskId || !isIndentIntent(delta)) {
          updateNestPreview(null)
          return
        }
        updateNestPreview(getIndentTargetId(useTaskStore.getState().tasks, taskId))
      },
      onDragEnd({ active, activatorEvent }: DragEndEvent) {
        clearNestPreview()
        setTaskDragging(false)
        const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
        if ((group && group.length > 1) || isTouchLiftEvent(activatorEvent)) clearSelectionRef.current()
      },
      onDragCancel({ active, activatorEvent }: DragCancelEvent) {
        clearNestPreview()
        setTaskDragging(false)
        // 浮かせて動かさずに離したときは選んだ状態のまま（選択バーを出す）
        if (isTouchLiftEvent(activatorEvent)) return
        const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
        if (group && group.length > 1) clearSelectionRef.current()
      },
    }),
    [clearNestPreview, updateNestPreview, clearSelectionRef],
  )
  useDndMonitor(dndMonitor)
  // 浮かせて押さえているだけの間は、落とし先（空の「セクションなし」）を出さない。動かしたら出す
  const liftHeld = useLiftHeld()

  return { previewParentId, taskDragging: taskDragging && !liftHeld }
}
