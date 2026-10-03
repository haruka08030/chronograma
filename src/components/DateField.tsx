import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { DueDatePopover } from './DueDatePopover'
import { CalendarIcon } from './icons'
import { dateFnsLocale, fromDateKey } from '../lib/dateKey'

/**
 * 日付の入力欄（記録の開始日・終了日、Google の予定の日付、まとめて期限など）。
 * ブラウザ標準の `<input type="date">` は画面ごとに見た目が違うので使わず、期限・予定日と同じカレンダーで選ぶ。
 * 空にできない日付用（「〜なし」は出さない）。期限・予定日は `DueDatePopover` を直接使う。
 */
export function DateField({
  value,
  onChange,
  min,
  disabled = false,
  ariaLabel,
  align = 'left',
  className = '',
  placeholder,
}: {
  /** `yyyy-MM-dd`。未選択は空文字か null */
  value: string | null
  onChange: (value: string) => void
  min?: string
  disabled?: boolean
  ariaLabel?: string
  align?: 'left' | 'right'
  /** ボタンの見た目（周りの入力欄に合わせる） */
  className?: string
  /** 未選択のときの文字 */
  placeholder?: string
}) {
  const { i18n } = useTranslation()
  const locale = dateFnsLocale(i18n.resolvedLanguage)
  const text = value ? format(fromDateKey(value), 'PPP', { locale }) : (placeholder ?? '')
  return (
    <DueDatePopover
      kind="date"
      value={value || null}
      min={min}
      onChange={(v) => v && onChange(v)}
      align={align}
      wrapperClassName="relative"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={toggle}
          className={`flex w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
            open ? 'ring-2 ring-accent-500/40' : ''
          } ${className}`}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-zinc-400" />
          <span className={`truncate ${value ? '' : 'text-zinc-400 dark:text-zinc-500'}`}>{text}</span>
        </button>
      )}
    />
  )
}
