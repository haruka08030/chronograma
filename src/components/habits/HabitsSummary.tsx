import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { subDays } from 'date-fns'
import type { Habit } from '../../types/habit'
import { completionRatioOnDate, consistencyForLast7Days, habitsStreak } from '../../lib/habitStats'
import type { HabitRecordIndex } from '../../lib/habitTiming'
import { appToday } from '../../lib/timeZone'
import { toDateKey } from '../../lib/dateKey'
import { useDateFormat } from '../../hooks/useDateFormat'

/** 習慣の要約: 数字 2 つ（直近 7 日の達成率・続いている日数）と直近 28 日の小さなヒートマップを 1 枚に */
export function HabitsSummary({ habits, habitRecords }: { habits: Habit[]; habitRecords: HabitRecordIndex }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const heatmapDays = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const d = subDays(appToday(), 27 - i)
        return { key: toDateKey(d), ratio: completionRatioOnDate(habits, d, habitRecords) }
      }),
    [habits, habitRecords],
  )
  const consistency = useMemo(() => consistencyForLast7Days(habits, habitRecords), [habits, habitRecords])
  // 週に◯回の習慣だけなら週で数える（`habitsStreak`）
  const streak = useMemo(() => habitsStreak(habits, habitRecords), [habits, habitRecords])
  const inWeeks = streak.unit === 'week'
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:gap-6">
      <dl className="flex shrink-0 gap-6">
        <div>
          <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{t('habits.score7d')}</dt>
          <dd className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{consistency}%</dd>
        </div>
        <div>
          <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{t(inWeeks ? 'habits.streakWeeks' : 'habits.streakDays')}</dt>
          <dd className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {streak.count}
            <span className="ml-0.5 text-sm font-normal text-zinc-500">{t(inWeeks ? 'habits.weekSuffix' : 'habits.daySuffix')}</span>
          </dd>
        </div>
      </dl>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[11px] text-zinc-500 dark:text-zinc-400">{t('habits.heatmapTitle')}</p>
        <div className="grid grid-cols-14 gap-1 sm:grid-cols-28" role="img" aria-label={t('habits.heatmapHint')}>
          {heatmapDays.map((d) => (
            <div
              key={d.key}
              className={`h-4 rounded-sm ${d.ratio === 0 ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
              style={d.ratio === 0 ? undefined : { backgroundColor: `rgba(99, 102, 241, ${0.3 + d.ratio * 0.7})` }}
              title={t('habits.heatmapTooltip', { date: df.shortDateWeekday(d.key), pct: Math.round(d.ratio * 100) })}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
