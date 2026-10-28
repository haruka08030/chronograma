import { useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '../hooks/useDismiss'
import { POPOVER_PANEL } from './ui/surface'
import { DatePickerBody } from './DatePickerBody'
import { useFocusBackOnClose } from '../hooks/useFocusBackOnClose'
import { useExitGhost } from '../hooks/useExitGhost'
import { useFitInViewport } from '../hooks/useFitInViewport'

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

  // ref ではなく state で持つ（描画中に渡す toggle から読むため）
  const [wrapperEl, setWrapperEl] = useState<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const exitRef = useExitGhost(panelRef)
  const dialogId = useId()

  useDismiss({ open, onClose: () => setOpen(false), inside: [panelRef, wrapperEl] })

  // 閉じたら（選んだ・Esc）開いた欄にフォーカスを戻す（パネルは body 直下なので、消えると BODY に落ちる）
  useFocusBackOnClose(open, () => wrapperEl?.querySelector<HTMLElement>('button, [tabindex]'))

  /**
   * 画面に固定して body 直下に出す。ダイアログやスクロールする欄の中でも切れない。
   * 下に入らなければ上、どちらにも入らなければ画面の中に寄せてパネルの中でスクロール。周りがスクロールしたら欄に付いていく
   */
  useFitInViewport(panelRef, {
    anchor: () => wrapperEl?.getBoundingClientRect() ?? null,
    placement: 'below',
    align: align === 'right' ? 'end' : 'start',
    disabled: !open,
  })

  const toggle = () => setOpen((o) => !o)

  const pick = (key: string | null) => {
    onChange(key)
    setOpen(false)
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 外へクリックを伝えないだけ（押して何かする部品ではない）
    <div ref={setWrapperEl} className={wrapperClassName} onClick={(e) => e.stopPropagation()}>
      {trigger({ open, toggle, value })}

      {open &&
        createPortal(
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- 外へクリックを伝えないだけ（押して何かする部品ではない）
          <div
            ref={exitRef}
            id={dialogId}
            // 開いている予定カードなどからは「内側」（押しても閉じない）
            data-popover-keep
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={t(
              kind === 'scheduled' ? 'dueDatePicker.scheduledTitle' : kind === 'date' ? 'dueDatePicker.dateTitle' : 'dueDatePicker.title',
            )}
            className={`fixed z-[90] w-[272px] p-3 ${POPOVER_PANEL}`}
          >
            <DatePickerBody value={value} min={min} kind={kind} onPick={pick} autoFocus />
          </div>,
          document.body,
        )}
    </div>
  )
}
