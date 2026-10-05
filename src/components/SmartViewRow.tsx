import { useTranslation } from 'react-i18next'
import { shortcutTip } from '../lib/tooltip'
import type { ShortcutId } from '../lib/shortcuts'
import type { SmartView } from '../store/taskStore'
import { PathIcon } from './PathIcon'

/** サイドバーと To‑Do パネルで共通のスマートビュー行 */
/** 1 文字ショートカットのある画面（マウスを乗せるとキーを出す） */
const VIEW_SHORTCUT: Partial<Record<SmartView, ShortcutId>> = { planner: 'dayView', calendar: 'weekView' }

export function SmartViewRow({
  view,
  icon,
  isSelected,
  onSelect,
}: {
  view: SmartView
  icon: string
  isSelected: boolean
  onSelect: () => void
}) {
  const shortcut = VIEW_SHORTCUT[view]
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onSelect}
      {...(shortcut ? shortcutTip(t(`sidebar.views.${view}`), shortcut) : {})}
      aria-current={isSelected ? 'page' : undefined}
      className={`flex w-full items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm text-left
        ${
          isSelected
            ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300 font-medium'
            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
    >
      <PathIcon d={icon} className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{t(`sidebar.views.${view}`)}</span>
    </button>
  )
}
