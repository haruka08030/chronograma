import type { MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDndContext } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskItem, type TaskItemSelection } from './TaskItem'
import { NestDragGuide } from './NestDragGuide'
import type { Task } from '../types/task'

export const TASK_PREFIX = 'task::'

export type TaskRootDragData = { dragGroupRootIds: string[] }

export function SortableTaskItem({
  task,
  dragGroupRootIds,
  onClick,
  onRowClick,
  onCompleteRequest,
  onEnterCreateSibling,
  selection,
  autoEdit,
  showNestGuide,
  children,
}: {
  task: Task
  /** この行をドラッグしたときにまとめて動かすルート ID（表示順・単体なら `[task.id]`） */
  dragGroupRootIds: string[]
  onClick?: () => void
  onRowClick?: (e: MouseEvent) => void
  onCompleteRequest?: (task: Task) => void
  onEnterCreateSibling?: (task: Task) => void
  selection?: TaskItemSelection
  autoEdit?: boolean
  /** 右ドラッグでサブ化プレビュー中、この行が親候補のとき */
  showNestGuide?: boolean
  /** 一覧内サブタスク（DnD 時は親とまとめて移動） */
  children?: ReactNode
}) {
  const { active } = useDndContext()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${TASK_PREFIX}${task.id}`,
    data: { dragGroupRootIds } satisfies TaskRootDragData,
  })

  const { t } = useTranslation()
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: active ? undefined : transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={t('common.dragToReorder')}
      className="cursor-grab touch-none p-1.5 opacity-100 active:cursor-grabbing md:p-0.5 md:opacity-70 md:group-hover:opacity-100"
      tabIndex={-1}
    >
      <svg className="w-4 h-4 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="9" cy="6" r="1.5" />
        <circle cx="15" cy="6" r="1.5" />
        <circle cx="9" cy="12" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
        <circle cx="9" cy="18" r="1.5" />
        <circle cx="15" cy="18" r="1.5" />
      </svg>
    </button>
  )

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {showNestGuide ? <NestDragGuide /> : null}
      <TaskItem
        task={task}
        onClick={onClick}
        onRowClick={onRowClick}
        onCompleteRequest={onCompleteRequest}
        onEnterCreateSibling={onEnterCreateSibling}
        selection={selection}
        autoEdit={autoEdit}
        dragHandle={handle}
        rowClassName="min-w-0"
      />
      {children}
    </div>
  )
}
