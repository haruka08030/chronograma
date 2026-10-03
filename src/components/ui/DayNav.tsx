import { useTranslation } from 'react-i18next'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import { buttonClass } from './buttonClass'
import { shortcutTip } from '../../lib/tooltip'

const ARROW =
  'rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:pointer-events-none disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'

/**
 * 日付の移動（今日 ＜ ＞）。今日の計画・習慣・カレンダー・週のふりかえりで共通。Google カレンダーと同じく「今日」が左。
 * いま見ているのが今日（今週）なら「今日」は押せないだけで消さない（矢印の位置が動かないように）。
 * `shortcuts` の画面では、ヒントに T / K / J を出す（キーは `useNavShortcut` で受ける）
 */
export function DayNav({
  onToday,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  todayLabel,
  atToday = false,
  nextDisabled = false,
  shortcuts = false,
}: {
  onToday: () => void
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  /** 省略すると「今日」 */
  todayLabel?: string
  /** いま今日（今週）を見ている */
  atToday?: boolean
  /** 先へ進めない（週のふりかえりは今週より先が無い） */
  nextDisabled?: boolean
  shortcuts?: boolean
}) {
  const { t } = useTranslation()
  const today = todayLabel ?? t('common.today')
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={onToday}
        disabled={atToday}
        {...shortcutTip(t('shortcuts.today'), shortcuts ? 'today' : undefined)}
        className={buttonClass({ variant: 'secondary', size: 'xs' }, 'mr-1')}
      >
        {today}
      </button>
      <button type="button" onClick={onPrev} aria-label={prevLabel} {...shortcutTip(prevLabel, shortcuts ? 'prev' : undefined)} className={ARROW}>
        <ChevronLeftIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={nextLabel}
        {...shortcutTip(nextLabel, shortcuts ? 'next' : undefined)}
        className={ARROW}
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
