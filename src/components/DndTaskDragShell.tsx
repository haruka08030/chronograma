import { useMemo, useState } from 'react'
import { DragOverlay, useDndMonitor, useDroppable } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { LIST_PREFIX } from './Sidebar'
import { TASK_PREFIX } from './SortableTaskItem'
import { TaskItem } from './TaskItem'
import { DRAGSEC_PREFIX, DROPSEC_PREFIX, parseSectionReorderId } from '../lib/sectionReorderDnD'
import type { TaskList } from '../types/list'

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
        ${highlighted
          ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-600'
          : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-600'}`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-black/10 dark:ring-white/10"
        style={{ backgroundColor: list.color }}
      />
      <span className="truncate text-zinc-800 dark:text-zinc-100">{list.name}</span>
    </div>
  )
}

const overlayHandleDecor = (
  <span className="opacity-70 p-0.5 touch-none flex-shrink-0" aria-hidden>
    <svg className="w-4 h-4 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  </span>
)

/** DragOverlay + モバイル用リストドロップ帯。DndContext の直下で使う */
export function DndTaskDragShell() {
  const listsRaw = useTaskStore((s) => s.lists)
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useMemo(() => [...listsRaw].sort((a, b) => a.order - b.order), [listsRaw])
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [sectionDragTitle, setSectionDragTitle] = useState<string | null>(null)

  const overlayTask = draggingTaskId ? tasks.find((t) => t.id === draggingTaskId) : undefined

  const monitor = useMemo(
    () => ({
      onDragStart({ active }: { active: { id: string | number } }) {
        const setHover = useTaskStore.getState().setTaskDragHoverListId
        const id = String(active.id)
        if (id.startsWith(DRAGSEC_PREFIX)) {
          setDraggingTaskId(null)
          setHover(null)
          const p = parseSectionReorderId(id, DRAGSEC_PREFIX)
          if (!p) {
            setSectionDragTitle(null)
            return
          }
          const sec = useTaskStore.getState().sections.find((s) => s.id === p.sectionId)
          setSectionDragTitle(sec?.name ?? 'セクション')
          return
        }
        setSectionDragTitle(null)
        if (!id.startsWith(TASK_PREFIX)) {
          setDraggingTaskId(null)
          setHover(null)
          return
        }
        const taskId = id.slice(TASK_PREFIX.length)
        const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
        setDraggingTaskId(task ? taskId : null)
        setHover(null)
      },
      onDragOver({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
        const setHover = useTaskStore.getState().setTaskDragHoverListId
        if (!String(active.id).startsWith(TASK_PREFIX)) {
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
        setSectionDragTitle(null)
        useTaskStore.getState().setTaskDragHoverListId(null)
      },
      onDragCancel() {
        setDraggingTaskId(null)
        setSectionDragTitle(null)
        useTaskStore.getState().setTaskDragHoverListId(null)
      },
    }),
    [],
  )

  useDndMonitor(monitor)

  return (
    <>
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
        {sectionDragTitle && (
          <div
            className="px-4 py-3 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700
                       text-sm text-zinc-800 dark:text-zinc-200 max-w-[min(90vw,20rem)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">セクション</p>
            <p className="font-medium truncate mt-0.5">{sectionDragTitle}</p>
            <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">別のセクション見出しの上にドロップして並べ替え</p>
          </div>
        )}
        {!sectionDragTitle && overlayTask && (
          <div
            className="pointer-events-none max-w-[min(90vw,24rem)] rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700
                       bg-white dark:bg-zinc-900 overflow-hidden"
          >
            <TaskItem task={overlayTask} dragHandle={overlayHandleDecor} />
          </div>
        )}
      </DragOverlay>

      {draggingTaskId && !sectionDragTitle && (
        <div
          className="md:hidden fixed bottom-0 inset-x-0 z-[52] pb-[max(0.75rem,env(safe-area-inset-bottom))]
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
