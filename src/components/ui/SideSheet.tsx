import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '../../hooks/useDismiss'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { ChevronLeftIcon } from '../icons'

/**
 * 右から出るシート（タスクの詳細・習慣の詳細）。背景を押す（閉じるだけで下には届けない、`useDismiss`。`onBackdropPress` で下を読んで別の動きにもできる）・Esc で閉じる。スマホは全画面で、上に戻るボタンを固定する（Google Tasks と同じ）。
 * Tab はシートの中だけを巡回し、閉じたら `returnFocus` の要素へフォーカスを戻す
 */
export function SideSheet({
  label,
  closing = false,
  onClose,
  returnFocus,
  onBackdropPress,
  children,
}: {
  /** 読み上げのシート名 */
  label: string
  /** 閉じる動きの最中（押せないようにして右へ引っ込める） */
  closing?: boolean
  onClose: () => void
  returnFocus?: () => HTMLElement | null | undefined
  /** 背景を押したとき、閉じる前に呼ぶ（押した所の下を読む。true なら閉じない）。押下は下に届けない */
  onBackdropPress?: (e: PointerEvent, root: HTMLElement | null) => boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // 背景の押下・Esc で閉じる（上に日付ピッカーなどが開いていればそちらが先）
  useDismiss({
    open: !closing,
    onClose,
    inside: [panelRef],
    backdrop: rootRef,
    onOutsidePress: onBackdropPress && ((e) => onBackdropPress(e, rootRef.current)),
  })
  const trapTab = useFocusTrap(panelRef, { active: !closing, returnFocus })

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- onKeyDown は Tab を中に留めるため
    <div ref={rootRef} className="fixed inset-0 z-50 flex justify-end" onKeyDown={trapTab} inert={closing}>
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
