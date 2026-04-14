import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskItem } from './TaskItem'
import type { Task } from '../types/task'

export function SortableTaskItem({ task, onClick }: { task: Task; onClick?: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  const handle = (
    <button
      {...attributes}
      {...listeners}
      className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 touch-none"
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
      <TaskItem task={task} onClick={onClick} dragHandle={handle} />
    </div>
  )
}
