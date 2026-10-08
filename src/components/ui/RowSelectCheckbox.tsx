import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon } from '../icons'

/**
 * 行の頭の選択の四角（To-Do の行・アーカイブ・ゴミ箱の行で共通）。
 * 選んでいる間（`reveal`）か選んだ行は出したまま、それ以外は PC で行に乗せたときだけ出す（スマホは隠す）。
 * 押しても行のクリック（詳細を開くなど）には渡さない
 */
export function RowSelectCheckbox({
  selected,
  reveal,
  onToggle,
  small = false,
}: {
  selected: boolean
  reveal: boolean
  onToggle: (e: MouseEvent) => void
  /** サブタスクの行（ひと回り小さく） */
  small?: boolean
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={t('taskItem.bulkSelectAria')}
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(e)
      }}
      className={`flex-shrink-0 rounded border flex items-center justify-center transition-[opacity,background-color,border-color] touch-manipulation
            ${small ? 'h-5 w-5 md:h-3.5 md:w-3.5' : 'h-6 w-6 md:h-4 md:w-4'}
            ${reveal || selected ? 'opacity-100' : 'hidden md:flex md:opacity-0 md:group-hover:opacity-100'}
            ${
              selected
                ? 'border-accent-500 bg-accent-500 text-on-accent'
                : 'border-zinc-300 dark:border-zinc-600 bg-transparent hover:border-zinc-400 dark:hover:border-zinc-500'
            }`}
    >
      {selected && <CheckIcon className={small ? 'w-2.5 h-2.5 md:w-2 md:h-2' : 'w-3 h-3 md:w-2.5 md:h-2.5'} strokeWidth={3} />}
    </button>
  )
}
