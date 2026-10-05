import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { dayMarkerClass } from '../../lib/dayMarker'
import { toDateKey } from '../../lib/dateKey'
import { useDateFormat } from '../../hooks/useDateFormat'
import { DayNav } from '../ui/DayNav'
import { SECTION_HEADING_CLASS } from '../ui/headingClass'

/** 「この日の習慣」の見出し: 見ている日と日の移動、その週の曜日（押すとその日へ。今日は藍の塗り、選んだ日は藍の枠） */
export function HabitWeekHeader({
  focusDate,
  focusKey,
  todayKey,
  weekDates,
  weekdayLabels,
  onToday,
  onShift,
}: {
  focusDate: Date
  focusKey: string
  todayKey: string
  weekDates: Date[]
  weekdayLabels: string[]
  onToday: () => void
  onShift: (delta: number) => void
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const setSelectedCalendarDateKey = useTaskStore((s) => s.setSelectedCalendarDateKey)
  return (
    <div className="space-y-2">
      <h2 className={SECTION_HEADING_CLASS}>{t('habits.listForDayTitle')}</h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{df.monthDayWeekday(focusDate)}</span>
        <DayNav
          onToday={onToday}
          onPrev={() => onShift(-1)}
          onNext={() => onShift(1)}
          prevLabel={t('habits.prevDayAria')}
          nextLabel={t('habits.nextDayAria')}
          atToday={focusKey === todayKey}
          shortcuts
        />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {weekDates.map((d, i) => {
          const key = toDateKey(d)
          const isColToday = key === todayKey
          const isColFocus = key === focusKey
          const labelTone = isColToday || isColFocus ? '' : 'text-zinc-400 dark:text-zinc-500'
          const headerDateShort = df.shortDate(d)
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedCalendarDateKey(key)}
              aria-label={t('habits.focusColumnAria', { date: headerDateShort })}
              aria-current={isColFocus ? 'date' : undefined}
              className={`w-full rounded-md py-1.5 text-center text-[10px] font-medium transition-colors hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 ${labelTone}`}
            >
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 ${dayMarkerClass({ today: isColToday, selected: isColFocus })}`}
              >
                {weekdayLabels[i]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
