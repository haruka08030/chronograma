import { useMemo, useState, useRef, useCallback, type RefObject } from 'react'
import { useDndMonitor, type DragCancelEvent, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { TASK_PREFIX, type TaskRootDragData } from '../components/SortableTaskItem'
import { SUBTASK_PREFIX, parseSubtaskDragId } from '../lib/subtaskDnD'
import { isIndentIntent } from '../lib/taskDragIntent'
import { getIndentTargetId } from '../lib/taskDepth'
import { DRAGSEC_PREFIX } from '../lib/sectionReorderDnD'

/**
 * To-Do 一覧のドラッグの見張り。字下げ（ネスト）の案内を出す親と、タスクをドラッグ中かを返す。
 * `clearSelectionRef` は選択の解除（選択はこのフックより後に作るので参照で受ける）
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
      onDragStart({ active }: DragStartEvent) {
        clearNestPreview()
        const id = String(active.id)
        setTaskDragging(id.startsWith(TASK_PREFIX) || id.startsWith(SUBTASK_PREFIX))
        if (id.startsWith(DRAGSEC_PREFIX)) {
          clearSelectionRef.current()
          return
        }
        if (id.startsWith(SUBTASK_PREFIX)) {
          clearSelectionRef.current()
          return
        }
        if (id.startsWith(TASK_PREFIX)) {
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
      onDragEnd({ active }: DragEndEvent) {
        clearNestPreview()
        setTaskDragging(false)
        const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
        if (group && group.length > 1) clearSelectionRef.current()
      },
      onDragCancel({ active }: DragCancelEvent) {
        clearNestPreview()
        setTaskDragging(false)
        const group = (active.data.current as TaskRootDragData | undefined)?.dragGroupRootIds
        if (group && group.length > 1) clearSelectionRef.current()
      },
    }),
    [clearNestPreview, updateNestPreview, clearSelectionRef],
  )
  useDndMonitor(dndMonitor)

  return { previewParentId, taskDragging }
}
