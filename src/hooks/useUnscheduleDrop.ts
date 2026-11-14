import { useTaskStore } from '../store/taskStore'
import { readDraggedTaskIds } from '../lib/useTimelineDrop'
import { setUnscheduleHover, UNSCHEDULE_DROP_ATTR, UNSCHEDULE_PATCH, useCalendarItemDrag } from '../lib/calendarItemDrag'
import { acceptTaskDrag, DROP_HIGHLIGHT_CLASS } from '../lib/taskDrag'
import { isTodoTask } from '../types/task'

/**
 * To-Do をつかんでいる間（`beginCalendarItemNativeDrag`・格子のブロックの移動）の「日付を外して To-Do に戻す」落とし先。
 * ネイティブ D&D はここで受け、格子のブロック（ポインタドラッグ）は `UNSCHEDULE_DROP_ATTR` を座標から探して受ける。
 * カレンダーの置き場・帯と今日の計画の帯で同じものを使う
 */
export function useUnscheduleDrop() {
  const itemDrag = useCalendarItemDrag()
  const dropProps = {
    [UNSCHEDULE_DROP_ATTR]: '',
    onDragOver: (e: React.DragEvent) => {
      if (!itemDrag.active || !acceptTaskDrag(e)) return
      setUnscheduleHover(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setUnscheduleHover(false)
    },
    onDrop: (e: React.DragEvent) => {
      if (!itemDrag.active) return
      e.preventDefault()
      setUnscheduleHover(false)
      const { tasks, updateTask, asOneUndo } = useTaskStore.getState()
      const moved = readDraggedTaskIds(e.dataTransfer)
        .map((id) => tasks.find((x) => x.id === id))
        // 記録と予定は To-Do の置き場に戻さない
        .filter((task) => !!task && isTodoTask(task))
      if (moved.length === 1) {
        const task = moved[0]!
        updateTask(task.id, UNSCHEDULE_PATCH, { key: 'undo.blockUnscheduled', params: { title: task.title } })
        return
      }
      asOneUndo(() => {
        for (const task of moved) updateTask(task!.id, UNSCHEDULE_PATCH)
      })
    },
  }
  return { itemDrag, dropProps, highlightClass: itemDrag.overUnschedule ? DROP_HIGHLIGHT_CLASS : '' }
}
