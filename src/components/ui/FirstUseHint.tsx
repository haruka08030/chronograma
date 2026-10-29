import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { tip } from '../../lib/tooltip'
import { CloseIcon } from '../icons'
import { iconButtonClass } from './iconButtonClass'
import { HINT_TEXT } from './textClass'

/**
 * その部分をまだ使っていない間だけ出す 1 行の説明（枠なし）。右に「詳しく」（使い方の節を開く）と ×。
 * 使ったら（`show` をデータから決める）自動で消え、× で閉じたら二度と出さない（`hintsDismissed`、端末に保存）。
 * ? のボタンを常に置く代わりに、要る所で要る時だけ伝える
 */
export function FirstUseHint({
  id,
  show,
  onMore,
  className = '',
  children,
}: {
  /** 閉じた印の名前（画面をまたいで一意） */
  id: string
  /** まだ使っていない間 true */
  show: boolean
  /** 「詳しく」で開く先。無ければ出さない */
  onMore?: () => void
  className?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const dismissed = useTaskStore((s) => s.hintsDismissed.includes(id))
  const dismiss = useTaskStore((s) => s.dismissHint)
  if (!show || dismissed) return null
  return (
    <p data-first-use-hint={id} className={`flex items-start gap-1 ${HINT_TEXT} ${className}`}>
      <span className="min-w-0 flex-1 py-1">
        {children}
        {onMore && (
          <>
            {' '}
            <button
              type="button"
              onClick={onMore}
              className="rounded-md font-medium text-accent-600 underline-offset-2 hover:underline dark:text-accent-400"
            >
              {t('hints.more')}
            </button>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={() => dismiss(id)}
        {...tip(t('hints.dismiss'), { name: true })}
        className={iconButtonClass('shrink-0 p-1.5')}
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </p>
  )
}
