import { useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { dispatchHotkey, useEscapeLayer, useHotkey } from '../../hooks/useHotkey'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { FLOATING_SURFACE } from './surface'

/**
 * 画面の中央に出すダイアログ（ラベル・色選択・完了＋記録・ショートカット一覧）。どれも同じ見た目にする。
 * - body 直下に重ね、背景を暗くする。背景を押すか Esc で閉じる（Esc は一番上の層だけ）
 * - 開いたらダイアログにフォーカスし、閉じたら元の場所に戻す。Tab / Shift+Tab はダイアログの中だけを巡回する（`useFocusTrap`）
 * - 予定カードの「外側クリックで閉じる」・1 文字ショートカットがダイアログ越しに効かないよう、
 *   キー入力はここで止め、`data-popover-keep` でカードに「内側」と知らせる。
 *   このダイアログが一番上のときのキー（`closeKeys` など）だけは止める前に `dispatchHotkey` へ渡す
 *
 * 中の余白・並べ方は `className` で（例: `p-5`、見出しと本文を分けるなら `flex flex-col`）。
 */
export function Modal({
  children,
  onClose,
  labelledBy,
  label,
  width = 'md',
  className = '',
  initialFocus,
  closeKeys,
}: {
  children: ReactNode
  onClose: () => void
  /** 見出しの id（見出しがあるとき） */
  labelledBy?: string
  /** 見出しが無いときの読み上げ名 */
  label?: string
  width?: 'sm' | 'md'
  className?: string
  /** 開いたときにフォーカスする要素（省略するとダイアログ自体） */
  initialFocus?: RefObject<HTMLElement | null>
  /** Esc のほかに閉じるキー（ショートカット一覧の「?」） */
  closeKeys?: string[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const layer = useEscapeLayer(onClose)
  useHotkey(closeKeys ?? [], onClose, { scope: layer, enabled: Boolean(closeKeys?.length) })
  const trapTab = useFocusTrap(ref, { initialFocus })

  return createPortal(
    <div
      data-popover-keep
      className="fixed inset-0 z-[80] flex animate-fade-in items-center justify-center bg-black/30 p-4 dark:bg-black/50"
      onKeyDown={(e) => {
        dispatchHotkey(e.nativeEvent, { layerOnly: true })
        e.stopPropagation()
        // 入力欄の Esc は層の仕組みでは拾わない（欄の取り消しを優先）。欄が使わなかった Esc でダイアログを閉じる
        if (e.key === 'Escape' && !e.defaultPrevented && !e.nativeEvent.isComposing && layer.isTop()) {
          e.preventDefault()
          onClose()
        }
        trapTab(e)
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={`animate-pop-in max-h-full w-full overflow-y-auto overscroll-contain rounded-2xl ${FLOATING_SURFACE} shadow-2xl outline-none ${
          width === 'sm' ? 'max-w-[380px]' : 'max-w-md'
        } ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** ダイアログの見出し（どのダイアログも同じ大きさ） */
export function ModalTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
      {children}
    </h2>
  )
}
