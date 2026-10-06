import { memo, type MouseEvent, type ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskItem, type TaskItemSelection } from './TaskItem'
import { NestDragGuide } from './NestDragGuide'
import { useRowGrip } from '../hooks/useRowGrip'
import type { Task } from '../types/task'

export const TASK_PREFIX = 'task::'

export type TaskRootDragData = { dragGroupRootIds: string[] }

export const SortableTaskItem = memo(function SortableTaskItem({
  task,
  dragGroupRootIds,
  onClick,
  onRowClick,
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
  onEnterCreateSibling?: (task: Task) => void
  selection?: TaskItemSelection
  autoEdit?: boolean
  /** 右ドラッグでサブ化プレビュー中、この行が親候補のとき */
  showNestGuide?: boolean
  /** 一覧内サブタスク（DnD 時は親とまとめて移動） */
  children?: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${TASK_PREFIX}${task.id}`,
    data: { dragGroupRootIds } satisfies TaskRootDragData,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    // ドラッグ中もまわりの行はすべって場所をあける（どこに入るかが目で追える）
    transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  // PC はつまみ ⠿、スマホは行の長押しで浮かせて運ぶ
  const { dragHandle, liftListeners } = useRowGrip(attributes, listeners)

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {showNestGuide ? <NestDragGuide /> : null}
      <TaskItem
        task={task}
        onClick={onClick}
        onRowClick={onRowClick}
        onEnterCreateSibling={onEnterCreateSibling}
        selection={selection}
        autoEdit={autoEdit}
        dragHandle={dragHandle}
        liftListeners={liftListeners}
        rowClassName="min-w-0"
      />
      {children}
    </div>
  )
})
