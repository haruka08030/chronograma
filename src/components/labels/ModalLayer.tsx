import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * ラベル編集・色選択のダイアログの土台（body 直下に重ねる）。
 * 予定カードの「外側クリックで閉じる」・1 文字ショートカット・Esc がダイアログ越しに効かないよう、
 * キー入力はここで止め、`data-popover-keep` でカードに「内側」と知らせる。
 */
export function ModalLayer({
  children,
  onDismiss,
  labelledBy,
}: {
  children: ReactNode
  onDismiss: () => void
  labelledBy: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => prev?.focus?.()
  }, [])

  return createPortal(
    <div
      ref={ref}
      data-popover-keep
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 outline-none dark:bg-black/50"
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') onDismiss()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onDismiss()
      }}
    >
      <div className="animate-pop-in max-h-full overflow-y-auto">{children}</div>
    </div>,
    document.body,
  )
}
