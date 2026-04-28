import { useDroppable } from '@dnd-kit/core'
import { nestDropId } from '../lib/subtaskDnD'

type Props = {
  parentTaskId: string
  /** サブタスク行は右端が狭いのでヒット域を少し詰める */
  compact?: boolean
}

/** 行の右端：このタスクの子へネストするドロップ先（下＋右の TickTick 風操作の「右」側） */
export function RowNestDropTarget({ parentTaskId, compact }: Props) {
  const id = nestDropId(parentTaskId)
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      data-row-nest-target
      className={`flex-none shrink-0 self-stretch min-h-[2rem] rounded-r-md transition-all touch-none
        ${compact ? 'w-[min(34%,6rem)] min-w-11' : 'w-[min(34%,7.5rem)] min-w-[3.25rem]'}
        ${isOver
          ? 'bg-accent-500/28 ring-inset ring-2 ring-accent-400/65 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]'
          : 'ring-inset ring-1 ring-transparent'}`}
      aria-hidden
    />
  )
}
