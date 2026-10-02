import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeLayer } from '../../hooks/useEscapeLayer'
import { FLOATING_SURFACE } from './surface'

/**
 * 画面の中央に出すダイアログ（ラベル・色選択・完了＋記録・ショートカット一覧）。どれも同じ見た目にする。
 * - body 直下に重ね、背景を暗くする。背景を押すか Esc で閉じる（Esc は一番上の層だけ）
 * - 開いたらダイアログにフォーカスし、閉じたら元の場所に戻す
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
  useEscapeLayer(onClose)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => prev?.focus?.()
  }, [])

  return createPortal(
    <div
      data-popover-keep
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 dark:bg-black/50"
      onKeyDown={(e) => e.stopPropagation()}
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

/** ダイアログの見出し（どのダイアログも同じ大きさ） */
export function ModalTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
      {children}
    </h2>
  )
}
