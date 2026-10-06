import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addWeeks, format, startOfWeek } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { foldLabelMinutes, getWeekReview } from '../lib/weekReview'
import { unplannedListIds } from '../lib/listKind'
import { colorVars, recordLabelKey, recordLabelKeyHex } from '../lib/logCategoryColors'
import { recordLabelKeyText } from '../lib/todoColorLabels'
import { appToday } from '../lib/timeZone'
import { DayNav } from './ui/DayNav'
import { dateFnsLocale, fromDateKey, toDateKey } from '../lib/dateKey'
import { formatDuration, formatDurationShort } from '../lib/timeGrid'
import { NEUTRAL_HEX } from '../lib/googleColors'
import { useDateFormat } from '../hooks/useDateFormat'
import { SectionLabel } from './ui/SectionLabel'
import { CARD_TITLE_CLASS } from './ui/headingClass'
import { META_TEXT } from './ui/textClass'
import { tip } from '../lib/tooltip'

/** 統計の先頭に置く「週のふりかえり」。数字は責めない言い方で、次週への一言を添える */
export function WeekReviewCard() {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore((s) => s.habits)
  const setSelectedCalendarDateKey = useTaskStore((s) => s.setSelectedCalendarDateKey)
  const selectView = useTaskStore((s) => s.selectView)
  const [weekOffset, setWeekOffset] = useState(0)
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  const df = useDateFormat()

  const anchor = useMemo(() => addWeeks(appToday(), weekOffset), [weekOffset])
  const lists = useTaskStore((s) => s.lists)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const labelPresets = useTaskStore((s) => s.timeLogTagPresets)
  const excluded = useMemo(() => unplannedListIds(lists), [lists])
  const review = useMemo(
    () => getWeekReview(tasks, habits, anchor, excluded, undefined, (log) => recordLabelKey(log, labelPresets, logCategoryColors)),
    [tasks, habits, anchor, excluded, labelPresets, logCategoryColors],
  )
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })

  const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`)
  // 棒は分類ごとの記録を積んだ高さ（棒の上の数字も同じ。ツールチップの合計は記録時間そのもの）
  const barMinutes = (d: { tagMinutes: { minutes: number }[] }) => d.tagMinutes.reduce((a, x) => a + x.minutes, 0)
  // 予定の枠も同じ目盛りで重ねるので、高さは記録と予定の大きいほうに合わせる
  const maxMinutes = Math.max(60, ...review.days.map((d) => Math.max(barMinutes(d), d.plannedMinutes)))
  const hasPlanned = review.plannedMinutes > 0
  const labelRows = foldLabelMinutes(review.labelMinutes)

  const insight = (() => {
    if (review.total === 0 && review.loggedMinutes === 0) return t('weekReview.insightEmpty')
    if (review.followRate != null && review.followRate >= 0.7) return t('weekReview.insightFollowHigh')
    if (review.followRate != null && review.followRate < 0.4) return t('weekReview.insightFollowLow')
    // 1 件も終えていない週に「進んでいます」とは言わない
    if (review.plannedMinutes === 0) return t(review.done > 0 ? 'weekReview.insightNoBlocks' : 'weekReview.insightNoBlocksNoDone')
    return t('weekReview.insightSteady')
  })()

  const tiles = [
    { label: t('weekReview.done'), value: `${review.done}/${review.total}`, sub: null },
    {
      label: t('weekReview.followRate'),
      value: pct(review.followRate),
      // 割合だけだと 1 件中 1 件か 10 件中 10 件か分からないので、分母を添える
      sub: review.timedPlanned > 0 ? t('weekReview.followCount', { followed: review.followed, total: review.timedPlanned }) : null,
    },
    { label: t('weekReview.logged'), value: formatDuration(review.loggedMinutes), sub: null },
    { label: t(weekOffset === 0 ? 'weekReview.habitsThisWeek' : 'weekReview.habits'), value: pct(review.habitRate), sub: null },
  ]

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className={CARD_TITLE_CLASS}>{t('weekReview.title')}</h2>
          <p className={META_TEXT}>{t('weekReview.range', { start: df.monthDayWeekday(weekStart) })}</p>
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
            {tile.sub && <dd className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">{tile.sub}</dd>}
          </div>
        ))}
      </dl>

      <p className="mt-4 rounded-lg bg-accent-50/70 px-3 py-2 text-xs leading-relaxed text-accent-800 dark:bg-accent-500/10 dark:text-accent-300">
        {insight}
      </p>

      <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_12rem]">
        <figure>
          <figcaption className="mb-2 flex items-center justify-between gap-2">
            <SectionLabel as="span">{t('weekReview.loggedPerDay')}</SectionLabel>
            {/* 後ろの薄い枠が何かを 1 語で（予定のある週だけ） */}
            {hasPlanned && (
              <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                <span className="gc-plan h-2.5 w-2.5 rounded-[2px]" style={colorVars(NEUTRAL_HEX)} aria-hidden />
                {t('weekReview.plannedLegend')}
              </span>
            )}
          </figcaption>
          <div className="flex h-32 items-end gap-2 border-b border-zinc-200 dark:border-zinc-700">
            {Array.from({ length: 7 }, (_, i) => {
              const day = review.days[i]
              const date = fromDateKey(toDateKey(weekStart))
              date.setDate(date.getDate() + i)
              const label = format(date, 'E', { locale: dateLocale })
              const dayBar = day ? barMinutes(day) : 0
              const h = Math.round((dayBar / maxMinutes) * 100)
              const plannedH = day ? Math.round((day.plannedMinutes / maxMinutes) * 100) : 0
              const dayTip = day
                ? t('weekReview.dayTooltip', {
                    day: label,
                    logged: formatDuration(day.loggedMinutes),
                    planned: formatDuration(day.plannedMinutes),
                    done: day.done,
                    total: day.total,
                  })
                : label
              return (
                // 押すとその日の今日の計画を開く（記録の中身を見に行ける）
                <button
                  key={i}
                  type="button"
                  aria-label={dayTip}
                  {...tip(dayTip)}
                  onClick={() => {
                    setSelectedCalendarDateKey(toDateKey(date))
                    selectView('planner')
                  }}
                  // 上の余白（pt-4）は合計の数字の分。棒の高さの % はその余白を除いた高さに対して
                  className="group relative flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end pt-4"
                >
                  {/* 予定の時間は棒の後ろに薄い枠で重ねる（記録が枠に届いたか・はみ出したかで予定と比べられる） */}
                  {plannedH > 0 && (
                    <div
                      className="gc-plan pointer-events-none absolute inset-x-0 bottom-0 rounded-t-[3px]"
                      style={{ ...colorVars(NEUTRAL_HEX), height: `calc((100% - 1rem) * ${plannedH / 100})` }}
                      aria-hidden
                    />
                  )}
                  {/* その日の記録の合計。スマホでも読めるよう常に出す（狭いので月のマスと同じ短い書き方） */}
                  {dayBar > 0 && (
                    <span className="relative mb-0.5 shrink-0 whitespace-nowrap text-[10px] leading-none tabular-nums text-zinc-500 dark:text-zinc-400">
                      {formatDurationShort(dayBar)}
                    </span>
                  )}
                  {/* 記録は分類の色で見せる: 多い分類を下に積む（右の「ラベル別の時間」と同じ色。今日の計画の記録の棒と同じ `gc-dot` で、隙間なく積む。分類の境目は線 1 本）。
                      予定の枠が左右に見えるよう、棒は少し細くする */}
                  <div
                    className="relative flex w-[calc(100%-6px)] shrink-0 flex-col-reverse overflow-hidden rounded-t-[3px] transition-opacity group-hover:opacity-85"
                    style={{ height: `${h}%`, minHeight: dayBar > 0 ? 2 : 0 }}
                  >
                    {day?.tagMinutes.map((x) => (
                      <div
                        key={x.tag}
                        className="gc-dot w-full basis-0 not-last:border-t-0"
                        style={{ ...colorVars(recordLabelKeyHex(x.tag, logCategoryColors)), flexGrow: x.minutes }}
                      />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="mt-1 flex gap-2">
            {Array.from({ length: 7 }, (_, i) => {
              const date = fromDateKey(toDateKey(weekStart))
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
          <SectionLabel as="h3" className="mb-2">
            {t('weekReview.byLabel')}
          </SectionLabel>
          {review.labelMinutes.length === 0 ? (
            <p className={META_TEXT}>{t('weekReview.noLogs')}</p>
          ) : (
            <ul className="space-y-1.5">
              {labelRows.shown.map((x) => (
                <li key={x.tag} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="gc-dot h-2 w-2 shrink-0 rounded-full"
                      style={colorVars(recordLabelKeyHex(x.tag, logCategoryColors))}
                      aria-hidden
                    />
                    <span className="truncate text-zinc-700 dark:text-zinc-300">
                      {recordLabelKeyText(x.tag, labelPresets, logCategoryColors, t)}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{formatDuration(x.minutes)}</span>
                </li>
              ))}
              {labelRows.others > 0 && (
                <li className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0" aria-hidden />
                    <span className="truncate text-zinc-500 dark:text-zinc-400">{t('weekReview.otherLabels')}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{formatDuration(labelRows.others)}</span>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
