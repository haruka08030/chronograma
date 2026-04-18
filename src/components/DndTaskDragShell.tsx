import { useMemo, useState } from 'react'
import { DragOverlay, useDndMonitor, useDroppable } from '@dnd-kit/core'
import { useTaskStore } from '../store/taskStore'
import { LIST_PREFIX } from './Sidebar'
import { TASK_PREFIX } from './SortableTaskItem'
import type { TaskList } from '../types/list'

export const MOBILE_DROP_PREFIX = 'mobile-drop::'

function MobileListChip({ list }: { list: TaskList }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${MOBILE_DROP_PREFIX}${list.id}` })
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium
        transition-all max-w-[40vw] truncate touch-none border-l-4
        ${isOver
          ? 'bg-accent-50 dark:bg-accent-500/20 border-accent-400/50 scale-[1.02] shadow-md'
          : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-600 border-l-transparent'}`}
      style={isOver ? { borderLeftColor: list.color } : undefined}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-black/10 dark:ring-white/10"
        style={{ backgroundColor: list.color }}
      />
      <span className="truncate text-zinc-800 dark:text-zinc-100">{list.name}</span>
    </div>
  )
}

/** DragOverlay + モバイル用リストドロップ帯。DndContext の直下で使う */
export function DndTaskDragShell() {
  const listsRaw = useTaskStore((s) => s.lists)
  const lists = useMemo(() => [...listsRaw].sort((a, b) => a.order - b.order), [listsRaw])
  const [dragTitle, setDragTitle] = useState<string | null>(null)
  const [hoverListId, setHoverListId] = useState<string | null>(null)

  const monitor = useMemo(
    () => ({
      onDragStart({ active }: { active: { id: string | number } }) {
        const id = String(active.id)
        if (!id.startsWith(TASK_PREFIX)) {
          setDragTitle(null)
          setHoverListId(null)
          return
        }
        const taskId = id.slice(TASK_PREFIX.length)
        const task = useTaskStore.getState().tasks.find((t) => t.id === taskId)
        setDragTitle(task?.title ?? null)
        setHoverListId(null)
      },
      onDragOver({ over }: { over: { id: string | number } | null }) {
        const o = over?.id != null ? String(over.id) : ''
        if (!o) {
          setHoverListId(null)
          return
        }
        if (o.startsWith('drop::')) {
          setHoverListId(o.slice('drop::'.length))
          return
        }
        if (o.startsWith(MOBILE_DROP_PREFIX)) {
          setHoverListId(o.slice(MOBILE_DROP_PREFIX.length))
          return
        }
        if (o.startsWith(LIST_PREFIX)) {
          setHoverListId(o.slice(LIST_PREFIX.length))
          return
        }
        setHoverListId(null)
      },
      onDragEnd() {
        setDragTitle(null)
        setHoverListId(null)
      },
      onDragCancel() {
        setDragTitle(null)
        setHoverListId(null)
      },
    }),
    [],
  )

  useDndMonitor(monitor)

  const hoverList = hoverListId ? lists.find((l) => l.id === hoverListId) : null

  return (
    <>
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
        {dragTitle && (
          <div
            className="px-4 py-3 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700
                       text-sm text-zinc-800 dark:text-zinc-200 max-w-[min(90vw,20rem)]"
          >
            <p className="font-medium truncate">{dragTitle}</p>
            {hoverList ? (
              <p className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-black/10 dark:ring-white/10"
                  style={{ backgroundColor: hoverList.color }}
                />
                <span className="truncate">
                  <span className="text-zinc-400 dark:text-zinc-500">移動先</span>{' '}
                  <span className="text-accent-600 dark:text-accent-400 font-medium">{hoverList.name}</span>
                </span>
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">サイドバーまたは下のリストへドロップ</p>
            )}
          </div>
        )}
      </DragOverlay>

      {dragTitle && (
        <div
          className="md:hidden fixed bottom-0 inset-x-0 z-[52] pb-[max(0.75rem,env(safe-area-inset-bottom))]
                 pt-2 px-3 bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800
                 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.35)]"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 px-0.5">
            リストへ移動
          </p>
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
