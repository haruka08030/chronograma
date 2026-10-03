import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeLayer } from '../../hooks/useEscapeLayer'
import { FLOATING_SURFACE } from './surface'

/**
 * 画面の中央に出すダイアログ（ラベル・色選択・完了＋記録・ショートカット一覧）。どれも同じ見た目にする。
 * - body 直下に重ね、背景を暗くする。背景を押すか Esc で閉じる（Esc は一番上の層だけ）
 * - 開いたらダイアログにフォーカスし、閉じたら元の場所に戻す。Tab / Shift+Tab はダイアログの中だけを巡回する
 * - 予定カードの「外側クリックで閉じる」・1 文字ショートカットがダイアログ越しに効かないよう、
 *   キー入力はここで止め、`data-popover-keep` でカードに「内側」と知らせる
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
}: {
  children: ReactNode
  onClose: () => void
  /** 見出しの id（見出しがあるとき） */
  labelledBy?: string
  /** 見出しが無いときの読み上げ名 */
  label?: string
  width?: 'sm' | 'md'
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isTopLayer = useEscapeLayer(onClose)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => prev?.focus?.()
  }, [])

  return createPortal(
    <div
      data-popover-keep
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 dark:bg-black/50"
      onKeyDown={(e) => {
        e.stopPropagation()
        // 入力欄の Esc は層の仕組みでは拾わない（欄の取り消しを優先）。欄が使わなかった Esc でダイアログを閉じる
        if (e.key === 'Escape' && !e.defaultPrevented && !e.nativeEvent.isComposing && isTopLayer()) {
          e.preventDefault()
          onClose()
        }
        if (e.key === 'Tab' && ref.current) trapTab(e, ref.current)
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
        className={`animate-pop-in max-h-full w-full overflow-y-auto rounded-2xl ${FLOATING_SURFACE} shadow-2xl outline-none ${
          width === 'sm' ? 'max-w-[380px]' : 'max-w-md'
        } ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/** フォーカスがダイアログの端に来たら反対の端へ回す（背景の画面へ抜けない） */
function trapTab(e: KeyboardEvent, dialog: HTMLElement) {
  const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  )
  if (items.length === 0) {
    e.preventDefault()
    dialog.focus()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  const outside = !dialog.contains(active) || active === dialog
  if (e.shiftKey && (active === first || outside)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (active === last || outside)) {
    e.preventDefault()
    first.focus()
  }
}

/** ダイアログの見出し（どのダイアログも同じ大きさ） */
export function ModalTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
      {children}
    </h2>
  )
}
