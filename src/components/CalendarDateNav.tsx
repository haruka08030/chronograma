import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { startOfMonth } from 'date-fns'
import { useDismiss } from '../hooks/useDismiss'
import { POPOVER_PANEL } from './ui/surface'
import { GoogleStatusDot } from './GoogleStatusDot'
import { DayNav } from './ui/DayNav'
import { DatePickerBody } from './DatePickerBody'
import { fromDateKey } from '../lib/dateKey'
import { useDateFormat } from '../hooks/useDateFormat'
import type { CalendarMode } from '../store/storeTypes'

type CalendarDateNavProps = {
  mode: CalendarMode
  /** 週の表示が 1 日だけのとき（スマホ幅）。見出しはその日、‹ › は 1 日ずつ */
  singleDay: boolean
  selectedDateKey: string
  monthCursor: Date
  weekAnchor: Date
  onGoToday: () => void
  onPrevPeriod: () => void
  onNextPeriod: () => void
  onPickDate: (dateKey: string) => void
}

export function CalendarDateNav({
  mode,
  singleDay,
  selectedDateKey,
  monthCursor,
  weekAnchor,
  onGoToday,
  onPrevPeriod,
  onNextPeriod,
  onPickDate,
}: CalendarDateNavProps) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const [open, setOpen] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(() => startOfMonth(monthCursor))
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useDismiss({ open, onClose: () => setOpen(false), inside: [panelRef, triggerRef] })

  const periodLabel =
    mode === 'month'
      ? df.yearMonth(monthCursor)
      : mode === 'schedule'
        ? df.monthDayWeekday(selectedDateKey)
      : singleDay
        ? df.monthDayWeekday(selectedDateKey)
        : df.weekRange(weekAnchor)

  const handlePickDay = (key: string) => {
    onPickDate(key)
    setOpen(false)
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800 sm:px-4">
      <DayNav
        onToday={onGoToday}
        onPrev={onPrevPeriod}
        onNext={onNextPeriod}
        todayLabel={t('calendarHub.today')}
        prevLabel={mode === 'month' ? t('calendarHub.navPrevMonthAria') : singleDay ? t('calendarHub.navPrevDayAria') : t('calendarHub.navPrevWeekAria')}
        nextLabel={mode === 'month' ? t('calendarHub.navNextMonthAria') : singleDay ? t('calendarHub.navNextDayAria') : t('calendarHub.navNextWeekAria')}
        shortcuts
      />

      <div className="flex min-w-0 flex-1 items-center gap-1 sm:relative sm:flex-initial">
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-haspopup="dialog"
          aria-label={t('calendarHub.openDatePickerAria')}
          onClick={() => {
            if (open) {
              setOpen(false)
            } else {
              setPickerMonth(
                mode === 'month'
                  ? startOfMonth(monthCursor)
                  : startOfMonth(fromDateKey(selectedDateKey)),
              )
              setOpen(true)
            }
          }}
          className="min-w-0 max-w-full truncate rounded-md px-2 py-1 text-left text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {periodLabel}
        </button>
        <GoogleStatusDot />

        {open && (
          <div
            ref={panelRef}
            id={listId}
            role="dialog"
            aria-label={t('calendarHub.miniPickerTitle')}
            // スマホでは期間の文字が右に寄るので、バーの左端にそろえて画面からはみ出さないようにする
            className={`absolute left-3 top-full z-50 mt-1 origin-top-left w-[min(100vw-1.5rem,272px)] p-3 sm:left-0 ${POPOVER_PANEL}`}
          >
            <DatePickerBody
              value={selectedDateKey}
              month={pickerMonth}
              kind="date"
              footer={false}
              onPick={(key) => key && handlePickDay(key)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
