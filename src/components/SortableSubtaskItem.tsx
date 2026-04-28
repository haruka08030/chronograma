import type { MouseEvent, ReactNode } from 'react'
import { useDndContext } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskItem, type TaskItemSelection } from './TaskItem'
import { RowNestDropTarget } from './RowNestDropTarget'
import type { Task } from '../types/task'
import { subtaskDragId } from '../lib/subtaskDnD'

export function SortableSubtaskItem({
  task,
  onClick,
  onRowClick,
  onCompleteRequest,
  onEnterCreateSibling,
  selection,
  autoEdit,
  children,
}: {
  task: Task
  onClick?: () => void
  onRowClick?: (e: MouseEvent) => void
  onCompleteRequest?: (task: Task) => void
  onEnterCreateSibling?: (task: Task) => void
  selection?: TaskItemSelection
  autoEdit?: boolean
  children?: ReactNode
}) {
  const { active } = useDndContext()
  const id = subtaskDragId(task.id)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

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
      className="opacity-70 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 touch-none"
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
    <div ref={setNodeRef} style={style}>
      <div className="flex min-w-0 items-stretch rounded-lg overflow-hidden">
        <TaskItem
          task={task}
          isSubtask
          onClick={onClick}
          onRowClick={onRowClick}
          onCompleteRequest={onCompleteRequest}
          onEnterCreateSibling={onEnterCreateSibling}
          selection={selection}
          autoEdit={autoEdit}
          dragHandle={handle}
          rowClassName="min-w-0 flex-1 rounded-r-none"
        />
        <RowNestDropTarget parentTaskId={task.id} compact />
      </div>
      {children}
    </div>
  )
}
