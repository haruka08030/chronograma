import { memo, useMemo, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskItem, type TaskItemSelection } from './TaskItem'
import { NestDragGuide } from './NestDragGuide'
import type { Task } from '../types/task'
import { subtaskDragId } from '../lib/subtaskDnD'

export const SortableSubtaskItem = memo(function SortableSubtaskItem({
  task,
  onClick,
  onRowClick,
  onEnterCreateSibling,
  selection,
  autoEdit,
  showNestGuide,
  children,
}: {
  task: Task
  onClick?: () => void
  onRowClick?: (e: MouseEvent) => void
  onEnterCreateSibling?: (task: Task) => void
  selection?: TaskItemSelection
  autoEdit?: boolean
  /** 右ドラッグでサブ化プレビュー中、この行が親候補のとき */
  showNestGuide?: boolean
  children?: ReactNode
}) {
  const id = subtaskDragId(task.id)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const { t } = useTranslation()
  const style = {
    transform: CSS.Transform.toString(transform),
    // ドラッグ中もまわりの行はすべって場所をあける（どこに入るかが目で追える）
    transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  // つまみは useSortable の attributes / listeners が変わったときだけ作り直す（TaskItem の memo を効かせる）
  const handle = useMemo(() => (
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
  ), [attributes, listeners, t])

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {showNestGuide ? <NestDragGuide /> : null}
      <TaskItem
        task={task}
        isSubtask
        onClick={onClick}
        onRowClick={onRowClick}
        onEnterCreateSibling={onEnterCreateSibling}
        selection={selection}
        autoEdit={autoEdit}
        dragHandle={handle}
        rowClassName="min-w-0"
      />
      {children}
    </div>
  )
})
