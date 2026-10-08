import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useEscapeLayer } from '../../hooks/useHotkey'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { ChevronLeftIcon } from '../icons'

/**
 * 右から出るシート（タスクの詳細・習慣の詳細）。外側タップ・Esc で閉じる。スマホは全画面で、上に戻るボタンを固定する（Google Tasks と同じ）。
 * Tab はシートの中だけを巡回し、閉じたら `returnFocus` の要素へフォーカスを戻す
 */
export function SideSheet({
  label,
  closing = false,
  onClose,
  returnFocus,
  children,
}: {
  /** 読み上げのシート名 */
  label: string
  /** 閉じる動きの最中（押せないようにして右へ引っ込める） */
  closing?: boolean
  onClose: () => void
  returnFocus?: () => HTMLElement | null | undefined
  children: ReactNode
}) {
  const { t } = useTranslation()
  // Esc で閉じる（上に日付ピッカーなどが開いていればそちらが先）
  useEscapeLayer(onClose)
  const panelRef = useRef<HTMLDivElement>(null)
  const trapTab = useFocusTrap(panelRef, { active: !closing, returnFocus })

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 背景を押して閉じるのはマウス・指の近道（キーは Esc）。onKeyDown は Tab を中に留めるため
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose} onKeyDown={trapTab} inert={closing}>
      <div className={`absolute inset-0 bg-black/20 dark:bg-black/40 ${closing ? 'animate-fade-out' : 'animate-fade-in'}`} />
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- 外へクリックを伝えないだけ（押して何かする部品ではない） */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative w-full outline-none max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700 dark:shadow-[-8px_0_24px_rgba(0,0,0,0.5)]
                   h-full overflow-y-auto overscroll-contain shadow-xl ${closing ? 'animate-slide-out' : 'animate-slide-in'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center border-b border-zinc-100 bg-white/95 px-1 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 md:hidden">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-600 touch-manipulation active:bg-zinc-100 dark:text-zinc-300 dark:active:bg-zinc-800"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
