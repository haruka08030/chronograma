import type { ListSection } from '../types/section'

/** セクション見出しの文字。To-Do 一覧・いつか・チェックリストで同じにする */
export const SECTION_HEADING_TEXT = 'text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400'

/**
 * いつか・チェックリストのセクション見出し。押すと上の入力欄からこのセクションに追加する
 * （もう一度押すと解除）。追加先になっている間は To-Do 一覧と同じ枠を出す
 */
export function ListSectionHeading({ section, isTarget, onToggleTarget }: {
  section: ListSection
  isTarget: boolean
  onToggleTarget: () => void
}) {
  return (
    <button
      type="button"
      data-section-anchor={section.id}
      aria-pressed={isTarget}
      onClick={onToggleTarget}
      className={`mt-4 block w-full scroll-mt-2 truncate rounded-lg px-3 py-1.5 text-left transition-colors ${SECTION_HEADING_TEXT}
        ${isTarget ? 'ring-1 ring-accent-400/30' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'}`}
    >
      {section.name}
    </button>
  )
}
