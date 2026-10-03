import { useCallback, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { useDismiss } from '../hooks/useDismiss'
import { POPOVER_PANEL } from './ui/surface'
import { isAppToday } from '../lib/timeZone'
import { dayMarkerClass } from '../lib/dayMarker'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { GoogleStatusDot } from './GoogleStatusDot'
import { DayNav } from './ui/DayNav'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { useDateFormat } from '../hooks/useDateFormat'

function miniMonthDays(viewMonth: Date) {
  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  return eachDayOfInterval({ start: calStart, end: calEnd })
}

type CalendarDateNavProps = {
  mode: 'month' | 'week'
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
      : df.weekRange(weekAnchor)

  const handlePickDay = useCallback(
    (key: string) => {
      onPickDate(key)
      setOpen(false)
    },
    [onPickDate],
  )

  const miniDays = miniMonthDays(pickerMonth)
  const weekdays = t('calendar.weekdayInitials', { returnObjects: true }) as string[]

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800 sm:px-4">
      <DayNav
        onToday={onGoToday}
        onPrev={onPrevPeriod}
        onNext={onNextPeriod}
        todayLabel={t('calendarHub.today')}
        prevLabel={mode === 'month' ? t('calendarHub.navPrevMonthAria') : t('calendarHub.navPrevWeekAria')}
        nextLabel={mode === 'month' ? t('calendarHub.navNextMonthAria') : t('calendarHub.navNextWeekAria')}
        shortcuts
      />

      <div className="relative flex min-w-0 flex-1 items-center gap-1 sm:flex-initial">
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
            className={`absolute left-0 top-full z-50 mt-1 w-[min(100vw-1.5rem,280px)] p-2 ${POPOVER_PANEL}`}
          >
            <div className="mb-2 flex items-center justify-between gap-1 px-0.5">
              <button
                type="button"
                aria-label={t('calendarHub.miniPickerPrevMonthAria')}
                onClick={() => setPickerMonth((m) => subMonths(m, 1))}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                {df.yearMonth(pickerMonth)}
              </span>
              <button
                type="button"
                aria-label={t('calendarHub.miniPickerNextMonthAria')}
                onClick={() => setPickerMonth((m) => addMonths(m, 1))}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {weekdays.map((d) => (
                <div key={d} className="py-1 text-center text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {miniDays.map((day) => {
                const key = toDateKey(day)
                const inMonth = isSameMonth(day, pickerMonth)
                const today = isAppToday(day)
                const selected = key === selectedDateKey
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePickDay(key)}
                    className={`flex h-8 items-center justify-center rounded-full text-xs font-medium transition-colors
                      ${!inMonth ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-800 dark:text-zinc-100'}
                      ${dayMarkerClass({ today, selected })}
                      ${!today && !selected ? 'hover:bg-zinc-100 dark:hover:bg-zinc-700' : ''}`}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
