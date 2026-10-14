import { useDroppable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { sectionDropId } from '../../lib/mainListTasks'
import { GROUP_HEADING_TEXT, SECTION_HEADING_TEXT } from '../ListSectionHeading'
import { useTextEntry } from '../../hooks/useTextEntry'
import { NAME_MAX_LENGTH } from '../../lib/textLimits'
import { TIER_DROP_PREFIX, tierSectionDropId, type SomedayTier } from '../../lib/somedayTier'

/**
 * セクションの末尾の落とし先。`empty` は中にタスクが無いとき（落とせる場所が分かるよう、点線の枠で大きく出す）。
 * `tier` はいつかの段の中のとき（落とすと段も移す）
 */
export function SectionDropZone({
  listId,
  sectionId,
  empty = false,
  tier,
}: {
  listId: string
  sectionId: string | null
  empty?: boolean
  tier?: SomedayTier
}) {
  const dropId = sectionDropId(listId, sectionId)
  const { setNodeRef, isOver } = useDroppable({ id: tier ? tierSectionDropId(tier, dropId) : dropId })
  return (
    <div
      ref={setNodeRef}
      className={`mx-2 rounded-md transition-colors ${empty ? 'min-h-12 border border-dashed border-zinc-300 dark:border-zinc-600' : 'min-h-3'} ${isOver ? 'bg-accent-500/15 ring-1 ring-accent-400/40' : ''}`}
      aria-hidden
    />
  )
}

/** いつかの段（夢・やりたい）の見出し。ドラッグで行を落とすとその段へ移す（見出しの行そのものが落とし先） */
export function SomedayTierHeading({ tier, title, dropTarget }: { tier: 'dream' | 'wish'; title: string; dropTarget: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${TIER_DROP_PREFIX}${tier}`, disabled: !dropTarget })
  return (
    <div
      ref={setNodeRef}
      data-someday-tier={tier}
      className={`relative z-10 mb-0.5 rounded-lg px-3 py-1.5 transition-colors ${GROUP_HEADING_TEXT} ${isOver ? 'bg-accent-500/15 ring-1 ring-accent-400/40' : ''}`}
    >
      {title}
    </div>
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
      maxLength={NAME_MAX_LENGTH}
      onClick={(e) => e.stopPropagation()}
      {...entry}
      className={`w-full rounded bg-transparent text-left ${SECTION_HEADING_TEXT} focus:outline-none focus:ring-1 focus:ring-accent-400/50`}
    />
  )
}
