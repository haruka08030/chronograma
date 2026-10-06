import { useTranslation } from 'react-i18next'
import { addDays, format } from 'date-fns'
import { useTaskStore } from '../../store/taskStore'
import type { Habit } from '../../types/habit'
import { consistencyForLast7Days } from '../../lib/habitStats'
import { isHabitScheduledOnDate } from '../../lib/habitSchedule'
import { habitDayStatus, habitRecordFor, type HabitRecordIndex } from '../../lib/habitTiming'
import { HABIT_DONE_FILL, HABIT_OFF_TIME_FILL, HABIT_OFF_TIME_TEXT } from '../../lib/habitMark'
import { colorVars } from '../../lib/logCategoryColors'
import { TODAY_TEXT } from '../../lib/dayMarker'
import { dateFnsLocale, toDateKey } from '../../lib/dateKey'
import { tip } from '../../lib/tooltip'
import { useDateFormat } from '../../hooks/useDateFormat'
import { CheckIcon } from '../icons'
import type { HabitMenuProps } from './useHabitMenu'

/** ISO 曜日（1=月）から曜日名を作るための、ある月曜日 */
const ISO_MONDAY = new Date(2024, 0, 1)

/**
 * 習慣のカード: 名前・決めた曜日と時刻・直近 7 日の達成率の輪と、見ている週の 7 つの丸（押すと達成を付ける / 外す）。
 * カードを押すと編集、右クリック（タッチは長押し）でメニュー（`menuProps`）。`offDay` はその日に予定の無い習慣（薄く出す）
 */
export function HabitCard({
  h,
  offDay,
  weekDates,
  habitRecords,
  todayKey,
  focusKey,
  weekdayLabels,
  menuProps,
  onEdit,
}: {
  h: Habit
  offDay: boolean
  weekDates: Date[]
  habitRecords: HabitRecordIndex
  todayKey: string
  focusKey: string
  weekdayLabels: string[]
  menuProps: HabitMenuProps
  onEdit: () => void
}) {
  const { t, i18n } = useTranslation()
  const df = useDateFormat()
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  // 上の要約と同じ定義（直近 7 日、今日は達成済みのときだけ）で揃える
  const weeklyProgress = consistencyForLast7Days([h], habitRecords)
  // 「週に3日」だと回数で数える習慣に読めるので、決めた曜日をそのまま出す（月・水・金）
  const goalText =
    h.frequency.type === 'daily'
      ? t('habits.goalDaily')
      : [...h.frequency.weekdays]
          .sort((a, b) => a - b)
          .map((d) => format(addDays(ISO_MONDAY, d - 1), 'E', { locale: dateLocale }))
          .join(t('habits.weekdaySeparator'))
  const timeText =
    h.timeMode === 'range' && h.startTime && h.endTime
      ? t('habits.timeRange', { start: h.startTime, end: h.endTime })
      : h.timeMode === 'fixed' && h.startTime
        ? t('habits.timeAtValue', { time: h.startTime })
        : null

  const cardSurface = offDay
    ? 'border-dashed border-zinc-200/90 bg-zinc-50/90 dark:border-zinc-600/80 dark:bg-zinc-950/45'
    : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40'
  const cardTone = offDay ? 'opacity-[0.92] saturate-[0.65]' : ''

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        {...menuProps}
        onClick={onEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onEdit()
          }
        }}
        className={`group select-none rounded-xl border p-4 transition-colors ${cardSurface} ${cardTone} ${
          offDay ? 'hover:bg-zinc-100/85 dark:hover:bg-zinc-900/50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="gc-dot h-3 w-3 shrink-0 rounded-full" style={colorVars(offDay ? '#a1a1aa' : h.color)} aria-hidden />
            <div className="min-w-0">
              <p
                className={`truncate text-base font-semibold tracking-tight ${
                  offDay ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-900 dark:text-zinc-100'
                }`}
              >
                {h.title}
              </p>
              <p className={`text-xs ${offDay ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
                {goalText}
                {timeText ? ` · ${timeText}` : ''}
              </p>
            </div>
          </div>
          {/* 達成率のリング。期間を下に添える（統計の「今週」と期間が違うので、何の % か分かるように） */}
          <div className="flex shrink-0 flex-col items-center gap-0.5" {...tip(t('habits.score7d'))}>
            <div
              className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100 dark:bg-zinc-800"
              style={{
                background: `conic-gradient(${offDay ? '#a1a1aa' : h.color} ${weeklyProgress * 3.6}deg, rgba(148,163,184,0.25) 0deg)`,
              }}
            >
              <div className="grid h-7 w-7 place-items-center rounded-full bg-white text-[10px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                {weeklyProgress}%
              </div>
            </div>
            <span className="whitespace-nowrap text-[10px] leading-none text-zinc-400 dark:text-zinc-500">{t('habits.ringPeriod')}</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map((d, di) => {
            const key = toDateKey(d)
            const isCellToday = key === todayKey
            const isCellFocus = key === focusKey
            const isScheduled = isHabitScheduledOnDate(h, d)
            const status = habitDayStatus(h, key, habitRecords)
            const isDone = status === 'done'
            const isOffTime = status === 'offTime'
            const record = isOffTime ? habitRecordFor(habitRecords, h, key) : null
            // 読み上げは「10月3日 (土) 達成」。時間外は時刻も添える（ツールチップはタッチでは見えないため）
            const cellDate = df.monthDayWeekday(d)
            const cellLabel = record
              ? t('habits.cellOffTimeAria', { date: cellDate, start: record.startTime, end: record.endTime })
              : isDone
                ? t('habits.cellDoneAria', { date: cellDate })
                : cellDate
            // 丸の塗りは達成の色なので、今日は曜日の文字で、選んだ日は枠で示す（カレンダーと同じ藍）
            const ringClass = isCellFocus ? 'ring-2 ring-date-400 ring-offset-2 ring-offset-transparent' : ''
            return (
              <button
                key={key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleHabitDate(h.id, key)
                }}
                className="flex flex-col items-center gap-1"
                aria-label={cellLabel}
                aria-pressed={isDone || isOffTime}
                {...tip(record ? t('habits.offTimeTooltip', { date: cellDate, start: record.startTime, end: record.endTime }) : undefined)}
              >
                {/* 達成・時間外は今日画面の丸と同じ塗り（時間外は 35%）。時間外は丸の下に小さく「時間外」（カードの高さに入れて、枠に重ねない） */}
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full text-sm transition-colors ${
                    isDone
                      ? HABIT_DONE_FILL
                      : isOffTime
                        ? HABIT_OFF_TIME_FILL
                        : isScheduled
                          ? 'bg-zinc-300/70 text-zinc-500 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                          : 'bg-zinc-200/55 text-zinc-400 hover:bg-zinc-300/80 dark:bg-zinc-800/70 dark:text-zinc-500 dark:hover:bg-zinc-700'
                  } ${ringClass}`}
                  style={colorVars(h.color)}
                >
                  {isDone || isOffTime ? (
                    <CheckIcon className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    <span className={`text-[11px] ${isCellToday ? TODAY_TEXT : ''}`}>{weekdayLabels[di]}</span>
                  )}
                </span>
                {isOffTime && (
                  <span aria-hidden className={`whitespace-nowrap text-[10px] leading-none ${HABIT_OFF_TIME_TEXT}`}>
                    {t('planner.habitOffTime')}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </li>
  )
}
