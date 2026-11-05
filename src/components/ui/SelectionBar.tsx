import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { openTaskMenu } from '../../lib/overlays'
import { CloseIcon } from '../icons'
import { INVERSE_SURFACE } from './surface'
import { FLOAT_BOTTOM, FLOAT_BOTTOM_ABOVE_TIMER } from './toastClass'

export interface SelectionAction {
  label: string
  icon?: ReactNode
  onClick: () => void
}

/**
 * 行を選んでいる間だけ下に浮かぶバー（To-Do 一覧・検索結果・今日の計画・アーカイブ・ゴミ箱で共通）。
 * 何件選んでいるかと、その画面でよく使う操作を並べ、残りは「操作」でタスクのメニューを開く。
 * 操作したら選択を外す。狭い幅は操作の印を消して詰め、入らなければ折り返す
 */
export function SelectionBar({
  selectedIds,
  actions = [],
  onClear,
  onOpenMenu,
}: {
  selectedIds: ReadonlySet<string>
  actions?: SelectionAction[]
  onClear: () => void
  /** 「操作」で開くメニュー（(x, y) の上に出す）。省略するとタスクの右クリックメニュー */
  onOpenMenu?: (x: number, y: number) => void
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
    'touch-hit whitespace-nowrap rounded-full px-3 py-1.5 font-medium max-[359px]:px-2 transition-colors touch-manipulation hover:bg-white/15 dark:hover:bg-zinc-900/10'
  return (
    <div
      data-selection-bar
      className={`fixed left-1/2 z-40 w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 animate-toast-in ${timerOpen ? FLOAT_BOTTOM_ABOVE_TIMER : FLOAT_BOTTOM}`}
    >
      <div
        role="toolbar"
        aria-label={t('taskList.selectedCount', { count: selectedIds.size })}
        className={`flex flex-wrap items-center justify-center gap-0.5 rounded-3xl py-1 pl-4 pr-1 text-sm max-[359px]:pl-3 ${INVERSE_SURFACE}`}
      >
        <span className="mr-2 whitespace-nowrap tabular-nums max-[359px]:mr-0.5">
          {t('taskList.selectedCount', { count: selectedIds.size })}
        </span>
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
            {a.icon && <span className="max-[359px]:hidden">{a.icon}</span>}
            {a.label}
          </button>
        ))}
        <button
          type="button"
          className={button}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            if (onOpenMenu) {
              onOpenMenu(r.left, r.top)
              return
            }
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
