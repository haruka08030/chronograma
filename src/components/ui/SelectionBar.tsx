import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { openTaskMenu } from '../../lib/overlays'
import { CloseIcon } from '../icons'
import { INVERSE_SURFACE } from './surface'

/** 下のナビ（スマホ）の上。記録中は浮くタイマーの上へ一段ずらす（UndoToast と同じ） */
const BOTTOM = 'bottom-[calc(3.5rem+0.75rem+env(safe-area-inset-bottom))] md:bottom-6'
const BOTTOM_ABOVE_TIMER = 'bottom-[calc(3.5rem+4.5rem+env(safe-area-inset-bottom))] md:bottom-24'

export interface SelectionAction {
  label: string
  icon?: ReactNode
  onClick: () => void
}

/**
 * 行を選んでいる間だけ下に浮かぶバー（To-Do 一覧・今日の計画で共通）。
 * 何件選んでいるかと、その画面でよく使う操作を並べ、残りは「操作」でタスクのメニューを開く。
 * 操作したら選択を外す
 */
export function SelectionBar({
  selectedIds,
  actions = [],
  onClear,
}: {
  selectedIds: ReadonlySet<string>
  actions?: SelectionAction[]
  onClear: () => void
}) {
  const { t } = useTranslation()
  const timerOpen = useTaskStore((s) => s.activeTimer !== null)
  const open = selectedIds.size > 0
  // バーが一番下の行に重ならないよう、出ている間はスクロールする面の下に余白を足す（`timer-safe`、index.css）
  useEffect(() => {
    if (!open) return
    document.documentElement.dataset.selectionOpen = ''
    return () => {
      delete document.documentElement.dataset.selectionOpen
    }
  }, [open])
  if (!open) return null
  const button =
    'whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors touch-manipulation hover:bg-white/15 dark:hover:bg-zinc-900/10'
  return (
    <div className={`fixed left-1/2 z-40 -translate-x-1/2 animate-toast-in ${timerOpen ? BOTTOM_ABOVE_TIMER : BOTTOM}`}>
      <div
        role="toolbar"
        aria-label={t('taskList.selectedCount', { count: selectedIds.size })}
        className={`flex items-center gap-0.5 rounded-full py-1 pl-4 pr-1 text-sm ${INVERSE_SURFACE}`}
      >
        <span className="mr-2 whitespace-nowrap tabular-nums">{t('taskList.selectedCount', { count: selectedIds.size })}</span>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`inline-flex items-center gap-1.5 ${button}`}
            onClick={() => {
              a.onClick()
              onClear()
            }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
        <button
          type="button"
          className={button}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            openTaskMenu({ kind: 'task', x: r.left, y: r.top, taskIds: [...selectedIds], above: true, onDone: onClear })
          }}
        >
          {t('taskMenu.actions')}
        </button>
        <button type="button" aria-label={t('taskList.clearSelection')} className={`p-2 ${button}`} onClick={onClear}>
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
