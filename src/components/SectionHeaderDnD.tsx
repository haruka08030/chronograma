import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { sectionDragHandleId, sectionDropHeaderId } from '../lib/sectionReorderDnD'
import { tip } from '../lib/tooltip'

/** 名前付きセクション見出し：行全体がドロップ先、左のハンドルでドラッグ */
export function SectionHeaderDnD({
  listId,
  sectionId,
  isQuickTarget,
  titleButton,
  actions,
}: {
  listId: string
  sectionId: string
  isQuickTarget: boolean
  titleButton: ReactNode
  actions: ReactNode
}) {
  const { t } = useTranslation()
  const dragId = sectionDragHandleId(listId, sectionId)
  const dropId = sectionDropHeaderId(listId, sectionId)

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: dragId,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dropId })

  /** リスト内の上下並べ替えのみ。タスクのように横方向へは動かさない */
  const rowStyle = transform
    ? { transform: CSS.Translate.toString({ ...transform, x: 0 }) }
    : undefined

  return (
    <div
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      style={rowStyle}
      className={`group relative z-10 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg mb-0.5 transition-colors bg-white dark:bg-zinc-900
        ${isQuickTarget ? 'ring-1 ring-accent-400/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'}
        ${isOver ? 'ring-2 ring-accent-400/50' : ''}
        ${isDragging ? 'opacity-70' : ''}`}
    >
      <div className="min-w-0 flex-1">{titleButton}</div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          {...listeners}
          {...attributes}
          className="touch-none flex-shrink-0 rounded-md p-1.5 cursor-grab active:cursor-grabbing md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100
                     text-zinc-400 md:p-1 md:text-zinc-300 hover:text-zinc-500 dark:text-zinc-500 dark:md:text-zinc-600 dark:hover:text-zinc-400
                     hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80"
          {...tip(t('taskList.reorderSection'))}
          aria-label={t('taskList.reorderSection')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
        {actions}
      </div>
    </div>
  )
}
