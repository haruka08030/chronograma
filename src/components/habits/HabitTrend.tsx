import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { subDays } from 'date-fns'
import type { Habit } from '../../types/habit'
import { HABIT_RATE_WEEKS, habitRecentRate, isHabitCountedOnDate } from '../../lib/habitStats'
import { habitAsOfWeek, isHabitDueOnDate } from '../../lib/habitSchedule'
import { habitDayStatus, type HabitRecordIndex } from '../../lib/habitTiming'
import { HABIT_MISSED } from '../../lib/habitMark'
import { colorVars } from '../../lib/logCategoryColors'
import { fromDateKey, toDateKey } from '../../lib/dateKey'
import { tip } from '../../lib/tooltip'
import { useDateFormat } from '../../hooks/useDateFormat'

/** 並べる日数（直近 4 週。右端が今日） */
const DAYS = HABIT_RATE_WEEKS * 7

/** マスの並び。PC は週の表の 7 日の列と同じ幅（`md:w-80`）にして縦にそろえる。スマホは横いっぱい */
const CELLS = 'grid grid-cols-4 gap-1.5 md:w-80 md:shrink-0'
/** 右端の達成率。週の表の右端（連続）と同じ幅 */
const TAIL = 'hidden md:block md:w-20 md:shrink-0'

type CellState = 'done' | 'missed' | 'none'

/**
 * 習慣画面の「直近 4 週」: 行＝習慣、28 日の小さなマス（左が古く右が今日）と直近 4 週の達成率。見るだけで、マスは押せない（行を押すと詳細）。
 * マス: やった日は習慣の色（gc-dot）、過ぎた予定の日でやらなかった日は灰の縁（週の表と同じ `HABIT_MISSED`）、
 * 予定の無い日・休み・作る前・まだ記録していない今日は小さな点。週に◯回の習慣は日ごとの予定が無いので、やった日だけ色を付ける
 */
export function HabitTrend({
  habits,
  todayKey,
  habitRecords,
  onOpen,
}: {
  habits: Habit[]
  todayKey: string
  habitRecords: HabitRecordIndex
  onOpen: (habit: Habit) => void
}) {
  const { t } = useTranslation()
  const days = useMemo(() => {
    const today = fromDateKey(todayKey)
    return Array.from({ length: DAYS }, (_, i) => subDays(today, DAYS - 1 - i))
  }, [todayKey])
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('habits.trendTitle', { weeks: HABIT_RATE_WEEKS })}</h2>
      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {habits.map((h) => (
          <HabitTrendRow key={h.id} habit={h} days={days} todayKey={todayKey} habitRecords={habitRecords} onOpen={() => onOpen(h)} />
        ))}
      </ul>
    </section>
  )
}

function cellState(h: Habit, d: Date, key: string, todayKey: string, records: HabitRecordIndex): CellState {
  if (habitDayStatus(h, key, records) !== 'missed') return 'done'
  if (key >= todayKey || habitAsOfWeek(h, d).frequency.type === 'timesPerWeek') return 'none'
  return isHabitDueOnDate(h, d, records) && isHabitCountedOnDate(h, d, records) ? 'missed' : 'none'
}

function HabitTrendRow({
  habit: h,
  days,
  todayKey,
  habitRecords,
  onOpen,
}: {
  habit: Habit
  days: Date[]
  todayKey: string
  habitRecords: HabitRecordIndex
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const rate = habitRecentRate(h, habitRecords)
  const rateText = rate === null ? '—' : `${rate}%`
  const weeks = Array.from({ length: HABIT_RATE_WEEKS }, (_, w) => days.slice(w * 7, w * 7 + 7))

  return (
    <li>
      {/* 行全体を押すと詳細。マスは見るだけ */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('habits.trendRowAria', { title: h.title, rate: rateText })}
        className="flex w-full flex-col gap-2 px-3 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/30 md:flex-row md:items-center md:gap-2 md:px-4 md:py-2.5"
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="gc-dot h-3 w-3 shrink-0 rounded-full" style={colorVars(h.color)} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100">{h.title}</span>
          <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400 md:hidden">{rateText}</span>
        </span>
        <span className={CELLS}>
          {weeks.map((week, w) => (
            <span key={w} className="grid grid-cols-7 gap-0.5">
              {week.map((d) => {
                const key = toDateKey(d)
                const state = cellState(h, d, key, todayKey, habitRecords)
                const date = df.monthDayWeekday(d)
                return (
                  <span
                    key={key}
                    className="grid aspect-square place-items-center"
                    {...tip(state === 'done' ? t('habits.cellDoneAria', { date }) : date)}
                  >
                    {state === 'none' ? (
                      <span className="h-0.5 w-0.5 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden />
                    ) : (
                      <span
                        className={`h-full w-full rounded-[3px] ${state === 'done' ? 'gc-dot' : HABIT_MISSED}`}
                        style={state === 'done' ? colorVars(h.color) : undefined}
                        aria-hidden
                      />
                    )}
                  </span>
                )
              })}
            </span>
          ))}
        </span>
        <span className={`${TAIL} text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400`}>{rateText}</span>
      </button>
    </li>
  )
}
