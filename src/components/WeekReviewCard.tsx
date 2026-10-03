import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addWeeks, format, parseISO, startOfWeek } from 'date-fns'
import { enUS, ja } from 'date-fns/locale'
import { useTaskStore } from '../store/taskStore'
import { getWeekReview } from '../lib/weekReview'
import { unplannedListIds } from '../lib/listKind'
import { categoryHex, colorVars } from '../lib/logCategoryColors'
import { appToday } from '../lib/timeZone'
import { DayNav } from './ui/DayNav'

/** 統計の先頭に置く「週のふりかえり」。数字は責めない言い方で、次週への一言を添える */
export function WeekReviewCard() {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore((s) => s.habits)
  const [weekOffset, setWeekOffset] = useState(0)
  const dateLocale = i18n.resolvedLanguage?.startsWith('ja') ? ja : enUS

  const anchor = useMemo(() => addWeeks(appToday(), weekOffset), [weekOffset])
  const lists = useTaskStore((s) => s.lists)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const excluded = useMemo(() => unplannedListIds(lists), [lists])
  const review = useMemo(() => getWeekReview(tasks, habits, anchor, excluded), [tasks, habits, anchor, excluded])
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })

  const fmtMin = (m: number) => {
    const h = Math.floor(m / 60)
    const min = m % 60
    if (h === 0) return t('planner.minutes', { m: min })
    if (min === 0) return t('planner.hours', { h })
    return t('planner.hoursMinutes', { h, m: min })
  }
  const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`)
  // 棒は分類ごとの記録を積んだ高さ（ツールチップの合計は記録時間そのもの）
  const barMinutes = (d: { tagMinutes: { minutes: number }[] }) => d.tagMinutes.reduce((a, x) => a + x.minutes, 0)
  const maxLogged = Math.max(60, ...review.days.map(barMinutes))

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
        <DayNav
          onToday={() => setWeekOffset(0)}
          onPrev={() => setWeekOffset((w) => w - 1)}
          onNext={() => setWeekOffset((w) => Math.min(0, w + 1))}
          todayLabel={t('weekReview.thisWeek')}
          prevLabel={t('weekReview.prevWeek')}
          nextLabel={t('weekReview.nextWeek')}
          atToday={weekOffset === 0}
          nextDisabled={weekOffset === 0}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800/60">
            <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{tile.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{tile.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 rounded-lg bg-accent-50/70 px-3 py-2 text-xs leading-relaxed text-accent-800 dark:bg-accent-500/10 dark:text-accent-300">
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
              const dayBar = day ? barMinutes(day) : 0
              const h = Math.round((dayBar / maxLogged) * 100)
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
                  {/* 記録は分類の色で見せる: 多い分類を下に積む（右の「よく使った時間」と同じ色） */}
                  <div
                    className="flex w-full flex-col-reverse overflow-hidden rounded-t transition-opacity group-hover:opacity-85"
                    style={{ height: `${h}%`, minHeight: dayBar > 0 ? 2 : 0 }}
                  >
                    {day?.tagMinutes.map((x) => (
                      <div
                        key={x.tag}
                        className="gc-dot w-full shrink-0"
                        style={{ ...colorVars(categoryHex(x.tag || null, logCategoryColors)), height: `${(x.minutes / dayBar) * 100}%` }}
                      />
                    ))}
                  </div>
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
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="gc-dot h-2 w-2 shrink-0 rounded-full" style={colorVars(categoryHex(x.tag || null, logCategoryColors))} aria-hidden />
                    <span className="truncate text-zinc-700 dark:text-zinc-300">{x.tag || t('labels.none')}</span>
                  </span>
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
