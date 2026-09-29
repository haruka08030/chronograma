import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addWeeks, format, parseISO, startOfWeek } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { getWeekReview } from '../lib/weekReview'

/** 統計の先頭に置く「週のふりかえり」。数字は責めない言い方で、次週への一言を添える */
export function WeekReviewCard() {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore((s) => s.habits)
  const [weekOffset, setWeekOffset] = useState(0)
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS

  const anchor = useMemo(() => addWeeks(new Date(), weekOffset), [weekOffset])
  const review = useMemo(() => getWeekReview(tasks, habits, anchor), [tasks, habits, anchor])
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })

  const fmtMin = (m: number) => {
    const h = Math.floor(m / 60)
    const min = m % 60
    if (h === 0) return t('planner.minutes', { m: min })
    if (min === 0) return t('planner.hours', { h })
    return t('planner.hoursMinutes', { h, m: min })
  }
  const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`)
  const maxLogged = Math.max(60, ...review.days.map((d) => d.loggedMinutes))

  const insight = (() => {
    if (review.total === 0 && review.loggedMinutes === 0) return t('weekReview.insightEmpty')
    if (review.followRate != null && review.followRate >= 0.7) return t('weekReview.insightFollowHigh')
    if (review.followRate != null && review.followRate < 0.4) return t('weekReview.insightFollowLow')
    if (review.plannedMinutes === 0) return t('weekReview.insightNoBlocks')
    return t('weekReview.insightSteady')
  })()

  const tiles = [
    { label: t('weekReview.done'), value: `${review.done}/${review.total}` },
    { label: t('weekReview.followRate'), value: pct(review.followRate) },
    { label: t('weekReview.logged'), value: fmtMin(review.loggedMinutes) },
    { label: t('weekReview.habits'), value: pct(review.habitRate) },
  ]

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t('weekReview.title')}</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {t('weekReview.range', { start: format(weekStart, t('weekReview.dateFormat'), { locale: dateLocale }) })}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label={t('weekReview.prevWeek')}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t('weekReview.thisWeek')}
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            disabled={weekOffset === 0}
            aria-label={t('weekReview.nextWeek')}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800/60">
            <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{tile.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{tile.value}</dd>
          </div>
        ))}
      </dl>
      {review.followRate != null && (
        <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
          {t('weekReview.followRateHint', { count: review.timedPlanned })}
        </p>
      )}

      <p className="mt-4 rounded-lg bg-accent-50/70 px-3 py-2 text-xs leading-relaxed text-accent-800 dark:bg-accent-500/10 dark:text-accent-200">
        {insight}
      </p>

      <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_12rem]">
        <figure>
          <figcaption className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">{t('weekReview.loggedPerDay')}</figcaption>
          <div className="flex h-28 items-end gap-2 border-b border-zinc-200 dark:border-zinc-700" role="list">
            {Array.from({ length: 7 }, (_, i) => {
              const day = review.days[i]
              const date = parseISO(`${format(weekStart, 'yyyy-MM-dd')}T12:00:00`)
              date.setDate(date.getDate() + i)
              const label = format(date, 'E', { locale: dateLocale })
              const h = day ? Math.round((day.loggedMinutes / maxLogged) * 100) : 0
              const tip = day
                ? t('weekReview.dayTooltip', {
                    day: label,
                    logged: fmtMin(day.loggedMinutes),
                    planned: fmtMin(day.plannedMinutes),
                    done: day.done,
                    total: day.total,
                  })
                : label
              return (
                <div key={i} role="listitem" title={tip} aria-label={tip} className="group flex h-full flex-1 flex-col justify-end">
                  <div
                    className="w-full rounded-t bg-accent-500 transition-colors group-hover:bg-accent-600 dark:bg-accent-400 dark:group-hover:bg-accent-300"
                    style={{ height: `${h}%`, minHeight: day && day.loggedMinutes > 0 ? 2 : 0 }}
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex gap-2">
            {Array.from({ length: 7 }, (_, i) => {
              const date = parseISO(`${format(weekStart, 'yyyy-MM-dd')}T12:00:00`)
              date.setDate(date.getDate() + i)
              return (
                <span key={i} className="flex-1 text-center text-[10px] text-zinc-400 dark:text-zinc-500">
                  {format(date, 'E', { locale: dateLocale })}
                </span>
              )
            })}
          </div>
        </figure>

        <div>
          <h3 className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">{t('weekReview.topTags')}</h3>
          {review.topTags.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{t('weekReview.noLogs')}</p>
          ) : (
            <ul className="space-y-1.5">
              {review.topTags.map((x) => (
                <li key={x.tag} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-zinc-700 dark:text-zinc-300">{x.tag || t('tags.untagged')}</span>
                  <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{fmtMin(x.minutes)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
