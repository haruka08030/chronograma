import { useDroppable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { sectionDropId } from '../../lib/mainListTasks'
import { SECTION_HEADING_TEXT } from '../ListSectionHeading'
import { useTextEntry } from '../../hooks/useTextEntry'

/** セクションの末尾の落とし先。`empty` は中にタスクが無いとき（落とせる場所が分かるよう、点線の枠で大きく出す） */
export function SectionDropZone({ listId, sectionId, empty = false }: { listId: string; sectionId: string | null; empty?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: sectionDropId(listId, sectionId) })
  return (
    <div
      ref={setNodeRef}
      className={`mx-2 rounded-md transition-colors ${empty ? 'min-h-12 border border-dashed border-zinc-300 dark:border-zinc-600' : 'min-h-3'} ${isOver ? 'bg-accent-500/15 ring-1 ring-accent-400/40' : ''}`}
      aria-hidden
    />
  )
}

/** セクション名の入力（新規・名前変更で共通）。Enter・フォーカス外しで確定、Esc で取り消し */
export function SectionNameInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const entry = useTextEntry({ onSubmit: onCommit, onCancel })
  return (
    <input
      autoFocus
      value={value}
      placeholder={t('sections.defaultName')}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      {...entry}
      className={`w-full rounded bg-transparent text-left ${SECTION_HEADING_TEXT} focus:outline-none focus:ring-1 focus:ring-accent-400/50`}
    />
  )
}
