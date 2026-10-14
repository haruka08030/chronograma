import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { isHabitRestOn, type Habit } from '../../types/habit'
import { habitLongestStreak, habitStreak, isHabitCountedOnDate } from '../../lib/habitStats'
import { habitWeekDoneCount, habitWeekRequired, isHabitDueOnDate } from '../../lib/habitSchedule'
import { habitDayStatus, habitMinutesOn, habitRecordFor, type HabitRecordIndex } from '../../lib/habitTiming'
import { HABIT_DONE_FILL, HABIT_MISSED, HABIT_OFF_TIME_FILL, HABIT_PENDING } from '../../lib/habitMark'
import { colorVars } from '../../lib/logCategoryColors'
import { TODAY_COLUMN, TODAY_TEXT } from '../../lib/dayMarker'
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
  addedId,
}: {
  habits: Habit[]
  weekDates: Date[]
  todayKey: string
  habitRecords: HabitRecordIndex
  menuProps: (habitId: string) => HabitMenuProps
  onOpen: (habit: Habit) => void
  /** いま足した習慣。その行だけふわっと出す */
  addedId?: string | null
}) {
  const weekdayLabels = useWeekdayLabels()
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      {/* すき間（gap-2）は行と同じにして、丸を曜日・日付の真下にそろえる */}
      <div className="flex items-end gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800 md:px-4">
        <div className="hidden min-w-0 flex-1 md:block" />
        {/* 今日の列の塗りを見出しの上下の余白まで伸ばす */}
        <div className={`${DAYS_GRID} -my-2 w-full self-stretch`}>
          {weekDates.map((d, i) => {
            const isToday = toDateKey(d) === todayKey
            return (
              <div
                key={i}
                className={`flex flex-col items-center justify-end py-2 leading-tight ${isToday ? `${TODAY_TEXT} ${TODAY_COLUMN}` : 'text-zinc-400 dark:text-zinc-500'}`}
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
            added={h.id === addedId}
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
  added,
}: {
  habit: Habit
  weekDates: Date[]
  todayKey: string
  habitRecords: HabitRecordIndex
  menuProps: HabitMenuProps
  onOpen: () => void
  added: boolean
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const goalText = useHabitGoalText(h)
  // 右端: 週に◯回は見ている週の回数（休みの日を除いた日数まで。まるごと休みの週は出さない）、
  // ほかは今の連続。途切れたら最長を残す（どちらも 0 なら出さない）
  const tail =
    h.frequency.type === 'timesPerWeek'
      ? (() => {
          const count = habitWeekRequired(h, weekDates[0])
          if (count === 0) return null
          return t('habits.weekCountValue', { done: Math.min(habitWeekDoneCount(h, weekDates[0], habitRecords), count), count })
        })()
      : (() => {
          const streak = habitStreak(h, habitRecords)
          if (streak.count > 0) return t('habits.streakValueDay', { count: streak.count })
          const longest = habitLongestStreak(h, habitRecords)
          return longest.count > 0 ? t('habits.longestValueDay', { count: longest.count }) : null
        })()

  return (
    <li
      {...menuProps}
      data-habit-row={h.id}
      className={`flex select-none flex-col gap-2 px-3 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/30 md:flex-row md:items-center md:px-4 md:py-2.5 ${added ? 'animate-sheet-in' : ''}`}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="gc-dot h-3 w-3 shrink-0 rounded-full" style={colorVars(h.color)} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{h.title}</span>
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{goalText}</span>
        </span>
        {tail && <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400 md:hidden">{tail}</span>}
      </button>
      {/* 今日の列の塗りを行の余白まで伸ばし、PC は上下の行とつなげて 1 本の縦列にする（スマホは名前が上に乗るので丸の段だけ） */}
      <div className={`${DAYS_GRID} -mb-3 md:-my-2.5 md:self-stretch`}>
        {weekDates.map((d) => {
          const key = toDateKey(d)
          const status = habitDayStatus(h, key, habitRecords)
          const isDone = status === 'done'
          const isOffTime = status === 'offTime'
          const isRest = isHabitRestOn(h, key)
          // 予定の日（作る前の日・週の回数を満たした週の残りの日は除く）だけ輪を出し、ほかは小さな点
          const isDue = isHabitDueOnDate(h, d, habitRecords) && isHabitCountedOnDate(h, d, habitRecords)
          const isFuture = key > todayKey
          const isPast = key < todayKey
          const record = isOffTime ? habitRecordFor(habitRecords, h, key) : null
          // 時間の目標に届いていない日の分（読み上げとツールチップだけ。マスには出さない）
          const minutes = h.goalMinutes && status === 'missed' ? habitMinutesOn(habitRecords, h, key) : 0
          const progress = minutes > 0 ? t('habits.goalProgress', { done: minutes, goal: h.goalMinutes }) : null
          const cellDate = df.monthDayWeekday(d)
          const cellLabel = record
            ? t('habits.cellOffTimeAria', { date: cellDate, start: record.startTime, end: record.endTime })
            : isDone
              ? t('habits.cellDoneAria', { date: cellDate })
              : isRest
                ? t('habits.restDayAria', { date: cellDate })
                : progress
                  ? `${cellDate} ${progress}`
                  : cellDate
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleHabitDate(h.id, key)}
              data-habit-day={key}
              aria-label={cellLabel}
              aria-pressed={isDone || isOffTime}
              className={`group/cell flex h-[3.25rem] items-center justify-center pb-3 md:h-auto md:min-h-[3.75rem] md:py-2.5 ${key === todayKey ? TODAY_COLUMN : ''}`}
              {...tip(
                record
                  ? t('habits.offTimeTooltip', { date: cellDate, start: record.startTime, end: record.endTime })
                  : progress
                    ? `${cellDate} ${progress}`
                    : undefined,
              )}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${
                  isDone
                    ? HABIT_DONE_FILL
                    : isOffTime
                      ? HABIT_OFF_TIME_FILL
                      : isDue
                        ? // 過ぎた日でやらなかった = 灰の輪、今日 = 習慣の色の輪、これから = 薄い色の輪
                          `${isPast ? HABIT_MISSED : HABIT_PENDING} group-hover/cell:bg-zinc-100 dark:group-hover/cell:bg-zinc-800 ${isFuture ? 'opacity-40' : ''}`
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
