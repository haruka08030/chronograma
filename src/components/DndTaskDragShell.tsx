import { useMemo, useState } from 'react'
import { useDndMonitor, useDroppable } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { LIST_PREFIX } from '../lib/listDnD'
import { TASK_PREFIX } from './SortableTaskItem'
import { SUBTASK_PREFIX, parseSubtaskDragId } from '../lib/subtaskDnD'
import { DRAGSEC_PREFIX, DROPSEC_PREFIX } from '../lib/sectionReorderDnD'
import type { TaskList } from '../types/list'
import { colorVars } from '../lib/logCategoryColors'
import { useLiftHeld } from '../hooks/useTouchLift'

export const MOBILE_DROP_PREFIX = 'mobile-drop::'

function MobileListChip({ list }: { list: TaskList }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${MOBILE_DROP_PREFIX}${list.id}` })
  const taskDragHoverListId = useTaskStore((s) => s.taskDragHoverListId)
  const highlighted = isOver || taskDragHoverListId === list.id
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium
        transition-colors max-w-[40vw] truncate touch-none border-l-4 border-l-transparent
        ${
          highlighted
            ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-600'
            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-600'
        }`}
    >
      <span className="gc-dot w-2 h-2 rounded-full flex-shrink-0" style={colorVars(list.color)} />
      <span className="truncate text-zinc-800 dark:text-zinc-100">{list.name}</span>
    </div>
  )
}

/** モバイル用リストドロップ帯 + タスクドラッグ監視。DndContext の直下で使う */
export function DndTaskDragShell() {
  const listsRaw = useTaskStore((s) => s.lists)
  const lists = useMemo(() => [...listsRaw].sort((a, b) => a.order - b.order), [listsRaw])
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)

  const monitor = useMemo(
    () => ({
      onDragStart({ active }: { active: { id: string | number } }) {
        const setHover = useTaskStore.getState().setTaskDragHoverListId
        const id = String(active.id)
        if (id.startsWith(DRAGSEC_PREFIX)) {
          setDraggingTaskId(null)
          setHover(null)
          return
        }
        let taskId: string | null = null
        if (id.startsWith(TASK_PREFIX)) taskId = id.slice(TASK_PREFIX.length)
        else if (id.startsWith(SUBTASK_PREFIX)) taskId = parseSubtaskDragId(id)
        if (!taskId) {
          setDraggingTaskId(null)
          setHover(null)
          return
        }
        const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
        setDraggingTaskId(task ? taskId : null)
        setHover(null)
      },
      onDragOver({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
        const setHover = useTaskStore.getState().setTaskDragHoverListId
        const aid = String(active.id)
        if (!aid.startsWith(TASK_PREFIX) && !aid.startsWith(SUBTASK_PREFIX)) {
          setHover(null)
          return
        }
        const o = over?.id != null ? String(over.id) : ''
        if (!o || o.startsWith(DRAGSEC_PREFIX) || o.startsWith(DROPSEC_PREFIX)) {
          setHover(null)
          return
        }
        if (o.startsWith('drop::')) {
          setHover(o.slice('drop::'.length))
          return
        }
        if (o.startsWith(MOBILE_DROP_PREFIX)) {
          setHover(o.slice(MOBILE_DROP_PREFIX.length))
          return
        }
        if (o.startsWith(LIST_PREFIX)) {
          setHover(o.slice(LIST_PREFIX.length))
          return
        }
        setHover(null)
      },
      onDragEnd() {
        setDraggingTaskId(null)
        useTaskStore.getState().setTaskDragHoverListId(null)
      },
      onDragCancel() {
        setDraggingTaskId(null)
        useTaskStore.getState().setTaskDragHoverListId(null)
      },
    }),
    [],
  )

  useDndMonitor(monitor)
  // 長押しで浮かせて押さえているだけ（選ぶだけかもしれない）の間は出さない。指を動かしたら出す
  const liftHeld = useLiftHeld()

  return (
    <>
      {draggingTaskId && !liftHeld && (
        <div
          className="md:hidden fixed inset-x-0 z-[52]
                 bottom-[calc(3.5rem+env(safe-area-inset-bottom))]
                 pt-2 px-3 bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800
                 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.35)]"
        >
          <div className="flex gap-2 overflow-x-auto pb-1">
            {lists.map((list) => (
              <MobileListChip key={list.id} list={list} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
