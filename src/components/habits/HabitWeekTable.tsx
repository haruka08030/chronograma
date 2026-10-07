import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Habit } from '../../types/habit'
import { habitStreak, isHabitCountedOnDate } from '../../lib/habitStats'
import { habitWeekDoneCount, isHabitDueOnDate } from '../../lib/habitSchedule'
import { habitDayStatus, habitRecordFor, type HabitRecordIndex } from '../../lib/habitTiming'
import { HABIT_DONE_FILL, HABIT_OFF_TIME_FILL, HABIT_PENDING } from '../../lib/habitMark'
import { colorVars } from '../../lib/logCategoryColors'
import { TODAY_TEXT } from '../../lib/dayMarker'
import { toDateKey } from '../../lib/dateKey'
import { tip } from '../../lib/tooltip'
import { useDateFormat } from '../../hooks/useDateFormat'
import { CheckIcon } from '../icons'
import { useHabitGoalText } from './useHabitGoalText'
import type { HabitMenuProps } from './useHabitMenu'

/** 7 日の列。見出しと各行で同じ幅にして縦にそろえる（スマホは横いっぱい） */
const DAYS_GRID = 'grid grid-cols-7 md:w-80 md:shrink-0'
/** 行の右端（連続・今週の回数）の幅。PC だけ列にする（スマホは名前の行の右） */
const TAIL = 'hidden md:block md:w-20 md:shrink-0'

/**
 * 習慣の表: 行＝習慣、列＝見ている週の 7 日。曜日と日付の見出しは上に 1 回だけ。
 * 丸を押すと達成を付ける / 外す。名前を押すと詳細（`onOpen`）、右クリック（タッチは長押し）でメニュー（`menuProps`）
 */
export function HabitWeekTable({
  habits,
  weekDates,
  todayKey,
  habitRecords,
  menuProps,
  onOpen,
}: {
  habits: Habit[]
  weekDates: Date[]
  todayKey: string
  habitRecords: HabitRecordIndex
  menuProps: (habitId: string) => HabitMenuProps
  onOpen: (habit: Habit) => void
}) {
  const weekdayLabels = useWeekdayLabels()
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-end border-b border-zinc-100 px-3 py-2 dark:border-zinc-800 md:px-4">
        <div className="hidden min-w-0 flex-1 md:block" />
        <div className={`${DAYS_GRID} w-full`}>
          {weekDates.map((d, i) => {
            const isToday = toDateKey(d) === todayKey
            return (
              <div
                key={i}
                className={`flex flex-col items-center leading-tight ${isToday ? TODAY_TEXT : 'text-zinc-400 dark:text-zinc-500'}`}
              >
                <span className="text-[11px]">{weekdayLabels[i]}</span>
                <span className="text-sm tabular-nums">{d.getDate()}</span>
              </div>
            )
          })}
        </div>
        <div className={TAIL} />
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {habits.map((h) => (
          <HabitWeekRow
            key={h.id}
            habit={h}
            weekDates={weekDates}
            todayKey={todayKey}
            habitRecords={habitRecords}
            menuProps={menuProps(h.id)}
            onOpen={() => onOpen(h)}
          />
        ))}
      </ul>
    </div>
  )
}

function useWeekdayLabels(): string[] {
  const { t } = useTranslation()
  return t('habits.weekdays', { returnObjects: true }) as string[]
}

function HabitWeekRow({
  habit: h,
  weekDates,
  todayKey,
  habitRecords,
  menuProps,
  onOpen,
}: {
  habit: Habit
  weekDates: Date[]
  todayKey: string
  habitRecords: HabitRecordIndex
  menuProps: HabitMenuProps
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const goalText = useHabitGoalText(h)
  // 右端: 週に◯回は見ている週の回数、ほかは今の連続（0 のときは出さない）
  const tail =
    h.frequency.type === 'timesPerWeek'
      ? t('habits.weekCountValue', {
          done: Math.min(habitWeekDoneCount(h, weekDates[0], habitRecords), h.frequency.count),
          count: h.frequency.count,
        })
      : (() => {
          const streak = habitStreak(h, habitRecords)
          return streak.count > 0 ? t('habits.streakValueDay', { count: streak.count }) : null
        })()

  return (
    <li
      {...menuProps}
      data-habit-row={h.id}
      className="flex select-none flex-col gap-2 px-3 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/30 md:flex-row md:items-center md:px-4 md:py-2.5"
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="gc-dot h-3 w-3 shrink-0 rounded-full" style={colorVars(h.color)} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{h.title}</span>
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{goalText}</span>
        </span>
        {tail && <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400 md:hidden">{tail}</span>}
      </button>
      <div className={DAYS_GRID}>
        {weekDates.map((d) => {
          const key = toDateKey(d)
          const status = habitDayStatus(h, key, habitRecords)
          const isDone = status === 'done'
          const isOffTime = status === 'offTime'
          // 予定の日（作る前の日・週の回数を満たした週の残りの日は除く）だけ輪を出し、ほかは小さな点
          const isDue = isHabitDueOnDate(h, d, habitRecords) && isHabitCountedOnDate(h, d, habitRecords)
          const isFuture = key > todayKey
          const record = isOffTime ? habitRecordFor(habitRecords, h, key) : null
          const cellDate = df.monthDayWeekday(d)
          const cellLabel = record
            ? t('habits.cellOffTimeAria', { date: cellDate, start: record.startTime, end: record.endTime })
            : isDone
              ? t('habits.cellDoneAria', { date: cellDate })
              : cellDate
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleHabitDate(h.id, key)}
              aria-label={cellLabel}
              aria-pressed={isDone || isOffTime}
              className="group/cell flex h-10 items-center justify-center"
              {...tip(record ? t('habits.offTimeTooltip', { date: cellDate, start: record.startTime, end: record.endTime }) : undefined)}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${
                  isDone
                    ? HABIT_DONE_FILL
                    : isOffTime
                      ? HABIT_OFF_TIME_FILL
                      : isDue
                        ? `${HABIT_PENDING} group-hover/cell:bg-zinc-100 dark:group-hover/cell:bg-zinc-800 ${isFuture ? 'opacity-40' : ''}`
                        : 'group-hover/cell:bg-zinc-100 dark:group-hover/cell:bg-zinc-800'
                }`}
                style={colorVars(h.color)}
              >
                {isDone || isOffTime ? (
                  <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
                ) : isDue ? null : (
                  <span className="h-1 w-1 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden />
                )}
              </span>
            </button>
          )
        })}
      </div>
      <div className={`${TAIL} text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400`}>{tail}</div>
    </li>
  )
}
