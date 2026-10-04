import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '../hooks/useDismiss'
import { POPOVER_PANEL } from './ui/surface'
import { DatePickerBody } from './DatePickerBody'
import { useFocusBackOnClose } from '../hooks/useFocusBackOnClose'

/** パネルの大きさ（位置合わせ用。`w-[272px]` と 6 週の高さ） */
const PANEL_WIDTH = 272
const PANEL_HEIGHT = 360

type TriggerArgs = {
  open: boolean
  toggle: () => void
  value: string | null
}

type DueDatePopoverProps = {
  /** `yyyy-MM-dd` 形式。未設定は null。 */
  value: string | null
  onChange: (value: string | null) => void
  /** ポップオーバーの水平アライン。 */
  align?: 'left' | 'right'
  /** トリガー部分のラッパー（`position: relative` の親）に付与する class。 */
  wrapperClassName?: string
  trigger: (args: TriggerArgs) => ReactNode
  /**
   * 期限（due）か予定日（scheduled）か、空にできない日付（date: 記録の日付など）か。
   * 見出しと「〜なし」ボタンが変わる（date には「〜なし」が無い）。
   */
  kind?: 'due' | 'scheduled' | 'date'
  /** これより前の日は選べない（`yyyy-MM-dd`。終了日の下限など） */
  min?: string
}

/** Google カレンダー（Web）風の日付ピッカー・ポップオーバー（期限・予定日・記録の日付で共通）。 */
export function DueDatePopover({
  value,
  onChange,
  align = 'right',
  wrapperClassName = 'relative',
  trigger,
  kind = 'due',
  min,
}: DueDatePopoverProps) {
  const { t } = useTranslation()

  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})

  // ref ではなく state で持つ（描画中に渡す toggle から読むため）
  const [wrapperEl, setWrapperEl] = useState<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dialogId = useId()

  useDismiss({ open, onClose: () => setOpen(false), inside: [panelRef, wrapperEl] })

  // 閉じたら（選んだ・Esc）開いた欄にフォーカスを戻す（パネルは body 直下なので、消えると BODY に落ちる）
  useFocusBackOnClose(open, () => wrapperEl?.querySelector<HTMLElement>('button, [tabindex]'))

  /**
   * 画面に固定して body 直下に出す。ダイアログやスクロールする欄の中でも切れない。
   * 下に余白がなければ上向き、横は画面からはみ出さないように寄せる。
   */
  const place = () => {
    const rect = wrapperEl?.getBoundingClientRect()
    if (!rect) return
    const below = window.innerHeight - rect.bottom
    const up = below < PANEL_HEIGHT && rect.top > below
    const left = align === 'right' ? rect.right - PANEL_WIDTH : rect.left
    setPanelStyle({
      position: 'fixed',
      left: Math.max(8, Math.min(left, window.innerWidth - PANEL_WIDTH - 8)),
      ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    })
  }

  // 開いている間に周りがスクロール・リサイズしたら、開くボタンに付いていく
  useEffect(() => {
    if (!open) return
    const onMove = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return
      place()
    }
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  })

  const toggle = () => {
    if (!open) {
      place()
    }
    setOpen((o) => !o)
  }

  const pick = (key: string | null) => {
    onChange(key)
    setOpen(false)
  }


  return (
    <div
      ref={setWrapperEl}
      className={wrapperClassName}
      onClick={(e) => e.stopPropagation()}
    >
      {trigger({ open, toggle, value })}

      {open && createPortal(
        <div
          ref={panelRef}
          id={dialogId}
          // 開いている予定カードなどからは「内側」（押しても閉じない）
          data-popover-keep
          style={panelStyle}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={t(
            kind === 'scheduled' ? 'dueDatePicker.scheduledTitle' : kind === 'date' ? 'dueDatePicker.dateTitle' : 'dueDatePicker.title',
          )}
          className={`z-[90] w-[272px] p-3 ${POPOVER_PANEL}`}
        >
          <DatePickerBody value={value} min={min} kind={kind} onPick={pick} autoFocus />
        </div>,
        document.body,
      )}
    </div>
  )
}
