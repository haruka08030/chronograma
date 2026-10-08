import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TimetableDialog } from './TimetableDialog'

/**
 * 週表示の見出しの「時間割」（#279）。押すと時間割（曜日 × 時限のマス）を開く。
 * 見た目は月表示の「よく入れる予定」と同じ小さな文字のボタン
 */
export function TimetableButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 ${className}`}
      >
        {t('timetable.button')}
      </button>
      {open && <TimetableDialog onClose={() => setOpen(false)} />}
    </>
  )
}
