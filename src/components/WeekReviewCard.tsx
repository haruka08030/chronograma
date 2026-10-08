import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Task } from '../types/task'
import { format } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { compareReviews, foldLabelMinutes, getPrevReview, getReview } from '../lib/weekReview'
import { reviewPeriodStart, shiftReviewPeriod, type ReviewPeriod } from '../lib/reviewPeriod'
import { ESTIMATE_ROWS, getEstimateRows } from '../lib/estimateActual'
import { unplannedListIds } from '../lib/listKind'
import { colorVars, recordLabelKey, recordLabelKeyHex } from '../lib/logCategoryColors'
import { recordLabelKeyText } from '../lib/todoColorLabels'
import { DayNav } from './ui/DayNav'
import { dateFnsLocale, fromDateKey, toDateKey } from '../lib/dateKey'
import { formatDuration, formatDurationShort } from '../lib/timeGrid'
import { useDateFormat } from '../hooks/useDateFormat'
import { SectionLabel } from './ui/SectionLabel'
import { Segmented } from './ui/Segmented'
import { ReviewMonthHeat } from './ReviewMonthHeat'
import { CARD_TITLE_CLASS } from './ui/headingClass'
import { META_TEXT } from './ui/textClass'

/** 予定の時間の枠（棒の後ろと凡例の見本で同じ） */
const PLANNED_FRAME = 'border border-dashed border-zinc-400 dark:border-zinc-500'
import { tip } from '../lib/tooltip'
import { useAppTodayKey } from '../hooks/useAppClock'

/** 期間ごとの文言のキー（週 / 月） */
const PERIOD_KEYS = {
  week: {
    title: 'weekReview.title',
    current: 'weekReview.thisWeek',
    prev: 'weekReview.prevWeek',
    next: 'weekReview.nextWeek',
    vsLast: 'weekReview.loggedVsLastWeek',
    vsPrev: 'weekReview.loggedVsPrevWeek',
    habits: 'weekReview.habits',
    habitsCurrent: 'weekReview.habitsThisWeek',
    insightEmpty: 'weekReview.insightEmpty',
    insightNoBlocks: 'weekReview.insightNoBlocks',
  },
  month: {
    title: 'weekReview.monthTitle',
    current: 'weekReview.thisMonth',
    prev: 'weekReview.prevMonth',
    next: 'weekReview.nextMonth',
    vsLast: 'weekReview.loggedVsLastMonth',
    vsPrev: 'weekReview.loggedVsPrevMonth',
    habits: 'weekReview.habitsMonth',
    habitsCurrent: 'weekReview.habitsThisMonth',
    insightEmpty: 'weekReview.insightEmptyMonth',
    insightNoBlocks: 'weekReview.insightNoBlocksMonth',
  },
} as const

/** 差の符号つきの書き方（「+1時間20分」「−45分」）。減っても色は付けない（事実だけ） */
const signed = (diff: number, fmt: (m: number) => string) => `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}`

/** 記録した時間の前の期間との差の文（「先週より +1時間20分」「先月と同じ」）。今の期間以外は「前の週 / 前の月」 */
function loggedDiffText(diff: number, period: ReviewPeriod, current: boolean, t: TFunction): string {
  const prefix = current ? PERIOD_KEYS[period].vsLast : PERIOD_KEYS[period].vsPrev
  if (diff === 0) return t(`${prefix}Same`)
  return t(prefix, { diff: signed(diff, formatDuration) })
}

/**
 * 統計の先頭に置く「ふりかえり」。週 / 月を見出しで切り替える（#304。カードは 1 枚のまま）。
 * 数字は責めない言い方で、次への一言を添える
 */
export function WeekReviewCard() {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore((s) => s.habits)
  const setSelectedCalendarDateKey = useTaskStore((s) => s.setSelectedCalendarDateKey)
  const selectView = useTaskStore((s) => s.selectView)
  const [period, setPeriod] = useState<ReviewPeriod>('week')
  // 今の期間から何期間前か（0 = 今週 / 今月）。週 ↔ 月を切り替えたら今に戻す
  const [offset, setOffset] = useState(0)
  const keys = PERIOD_KEYS[period]
  const atCurrent = offset === 0
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  const df = useDateFormat()

  // 週・月をまたいだら基準の期間も進める（今日の日付を依存に入れる）
  const todayKey = useAppTodayKey()
  const anchor = useMemo(() => shiftReviewPeriod(period, fromDateKey(todayKey), offset), [period, todayKey, offset])
  const lists = useTaskStore((s) => s.lists)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const labelPresets = useTaskStore((s) => s.timeLogTagPresets)
  const excluded = useMemo(() => unplannedListIds(lists), [lists])
  const labelOf = useMemo(() => (log: Task) => recordLabelKey(log, labelPresets, logCategoryColors), [labelPresets, logCategoryColors])
  const review = useMemo(
    () => getReview(tasks, habits, period, anchor, excluded, undefined, labelOf),
    [tasks, habits, period, anchor, excluded, labelOf],
  )
  // 前の期間との差（記録した時間・ラベル別）。前の期間も同じ日までで比べる
  const comparison = useMemo(
    () => compareReviews(review, getPrevReview(tasks, habits, period, anchor, excluded, undefined, labelOf)),
    [review, tasks, habits, period, anchor, excluded, labelOf],
  )
  const loggedDiff = comparison.loggedDiff
  // 見積もりと記録（#297）: この期間に終えた To-Do だけ（決めた後に見る）。大きく超えたものが先頭
  const estimateRows = useMemo(
    () => getEstimateRows(tasks, anchor, excluded, undefined, period).slice(0, ESTIMATE_ROWS),
    [tasks, anchor, excluded, period],
  )
  const estimateMax = Math.max(1, ...estimateRows.map((r) => Math.max(r.estimateMinutes, r.loggedMinutes)))
  const weekStart = reviewPeriodStart(period, anchor)
  const openDay = (key: string) => {
    setSelectedCalendarDateKey(key)
    selectView('planner')
  }

  const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`)
  // 棒は分類ごとの記録を積んだ高さ（棒の上の数字も同じ。ツールチップの合計は記録時間そのもの）
  const barMinutes = (d: { tagMinutes: { minutes: number }[] }) => d.tagMinutes.reduce((a, x) => a + x.minutes, 0)
  // 予定の枠も同じ目盛りで重ねるので、高さは記録と予定の大きいほうに合わせる
  const maxMinutes = Math.max(60, ...review.days.map((d) => Math.max(barMinutes(d), d.plannedMinutes)))
  const hasPlanned = review.plannedMinutes > 0
  const labelRows = foldLabelMinutes(review.labelMinutes)
  // ラベル別の前の月との差は月だけ（週は記録した時間の差だけで足りる）。前の月に記録が無ければ出さない
  const showLabelDiff = period === 'month' && comparison.loggedDiff != null

  const insight = (() => {
    if (review.total === 0 && review.loggedMinutes === 0) return t(keys.insightEmpty)
    if (review.followRate != null && review.followRate >= 0.7) return t('weekReview.insightFollowHigh')
    if (review.followRate != null && review.followRate < 0.4) return t('weekReview.insightFollowLow')
    // 1 件も終えていない週に「進んでいます」とは言わない
    if (review.plannedMinutes === 0) return t(review.done > 0 ? keys.insightNoBlocks : 'weekReview.insightNoBlocksNoDone')
    if (review.done === 0 && review.total > 0) return t('weekReview.insightNoDone', { time: formatDuration(review.loggedMinutes) })
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
    {
      label: t('weekReview.logged'),
      value: formatDuration(review.loggedMinutes),
      // 前の週との差は事実だけ（減っても色を付けない）。前の週に記録が無ければ出さない
      sub: loggedDiff == null ? null : loggedDiffText(loggedDiff, period, atCurrent, t),
      // 記録の無い時間（起きている間の 30 分以上の抜け）も同じ枠に小さく
      note: review.unrecordedMinutes > 0 ? t('weekReview.unrecorded', { time: formatDuration(review.unrecordedMinutes) }) : null,
      noteTitle: t('weekReview.unrecordedHint'),
    },
    { label: t(atCurrent ? keys.habitsCurrent : keys.habits), value: pct(review.habitRate), sub: null },
  ]

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
        {/* スマホは見出しと切り替えを 2 行に分ける（週の範囲の文が長く、週 ↔ 月で並びが変わらないように） */}
        <div className="min-w-0 basis-full sm:basis-auto">
          <h2 className={CARD_TITLE_CLASS}>{t(keys.title)}</h2>
          <p className={META_TEXT}>
            {period === 'month' ? df.yearMonth(weekStart) : t('weekReview.range', { start: df.monthDayWeekday(weekStart) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented<ReviewPeriod>
            value={period}
            options={[
              { value: 'week', label: t('weekReview.periodWeek') },
              { value: 'month', label: t('weekReview.periodMonth') },
            ]}
            onChange={(p) => {
              setPeriod(p)
              setOffset(0)
            }}
            ariaLabel={t('weekReview.periodAria')}
          />
          <DayNav
            onToday={() => setOffset(0)}
            onPrev={() => setOffset((w) => w - 1)}
            onNext={() => setOffset((w) => Math.min(0, w + 1))}
            todayLabel={t(keys.current)}
            prevLabel={t(keys.prev)}
            nextLabel={t(keys.next)}
            atToday={atCurrent}
            nextDisabled={atCurrent}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800/60">
            <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{tile.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{tile.value}</dd>
            {tile.sub && <dd className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">{tile.sub}</dd>}
            {'note' in tile && tile.note && (
              <dd className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500" {...tip(tile.noteTitle)}>
                {tile.note}
              </dd>
            )}
          </div>
        ))}
      </dl>

      <p className="mt-4 rounded-lg bg-accent-50/70 px-3 py-2 text-xs leading-relaxed text-accent-800 dark:bg-accent-500/10 dark:text-accent-300">
        {insight}
      </p>

      <div className={`mt-4 grid gap-5 ${showLabelDiff ? 'sm:grid-cols-[1fr_15rem]' : 'sm:grid-cols-[1fr_12rem]'}`}>
        <figure>
          <figcaption className="mb-2 flex items-center justify-between gap-2">
            <SectionLabel as="span">{t('weekReview.loggedPerDay')}</SectionLabel>
            {/* 後ろの薄い枠が何かを 1 語で（予定のある週だけ。月は濃さで見せるので枠が無い） */}
            {period === 'week' && hasPlanned && (
              <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                <span className={`h-2.5 w-2.5 rounded-[2px] ${PLANNED_FRAME}`} aria-hidden />
                {t('weekReview.plannedLegend')}
              </span>
            )}
          </figcaption>
          {period === 'month' ? (
            <ReviewMonthHeat month={weekStart} days={review.days} todayKey={todayKey} onOpenDay={openDay} />
          ) : (
            <>
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
                      onClick={() => openDay(toDateKey(date))}
                      // 上の余白（pt-4）は合計の数字の分。棒の高さの % はその余白を除いた高さに対して
                      className="group relative flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end pt-4"
                    >
                      {/* 予定の時間は棒の後ろに点線の枠で重ねる（記録が枠に届いたか・はみ出したかで予定と比べられる）。
                      塗ると「ラベルなし」の灰色の積み上げと見分けられないので、枠だけ */}
                      {plannedH > 0 && (
                        <div
                          className={`pointer-events-none absolute inset-x-0 bottom-0 rounded-t-[3px] ${PLANNED_FRAME}`}
                          style={{ height: `calc((100% - 1rem) * ${plannedH / 100})` }}
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
            </>
          )}
        </figure>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <SectionLabel as="h3">{t('weekReview.byLabel')}</SectionLabel>
            {/* 月は前の月との差を右に添える（何と比べた数字かを 1 語で） */}
            {showLabelDiff && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {t(atCurrent ? 'weekReview.labelDiffLastMonth' : 'weekReview.labelDiffPrevMonth')}
              </span>
            )}
          </div>
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
                  <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatDuration(x.minutes)}
                    {showLabelDiff && <LabelDiff diff={comparison.labelDiff.get(x.tag) ?? 0} />}
                  </span>
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

      {/* 見積もりと記録（#297）。結び付いた記録のある完了 To-Do が無い週は出さない（ごちゃつかせない）。
          超えても色で責めない: 点線の枠が見積もり、塗りが記録（日ごとの棒の予定の枠と同じ見方） */}
      {estimateRows.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <SectionLabel as="h3">{t('weekReview.estimateTitle')}</SectionLabel>
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500">
              <span className={`h-2.5 w-2.5 rounded-[2px] ${PLANNED_FRAME}`} aria-hidden />
              {t('weekReview.estimateLegend')}
            </span>
          </div>
          {/* スマホは 題名・数字 の下に棒、広い画面は 題名・棒・数字 を 1 行に（棒が横いっぱいに伸びて読みにくくならないよう幅を決める）。
              行をまたいで列をそろえる（数字の幅が違っても棒の左端・目盛りが同じ位置）ので、表全体を 1 つのグリッドにする。
              広い画面は棒を真ん中の列に戻す（dense で同じ行の空きに詰める） */}
          <ul className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-xs sm:grid-flow-row-dense sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:gap-y-2">
            {estimateRows.map((r) => (
              <li key={r.task.id} className="contents">
                <span className="truncate text-zinc-700 dark:text-zinc-300">{r.task.title}</span>
                <span className="shrink-0 text-right tabular-nums text-zinc-500 sm:col-start-3 dark:text-zinc-400">
                  {t('weekReview.estimateRow', { estimate: formatDuration(r.estimateMinutes), logged: formatDuration(r.loggedMinutes) })}
                </span>
                {/* 点線の枠が見積もり、塗りが記録（いちばん長い記録のラベルの色）。日ごとの棒と同じく、塗りは枠より少し細い */}
                <div className="relative col-span-2 mb-1.5 h-3 sm:col-span-1 sm:col-start-2 sm:mb-0" aria-hidden>
                  <div
                    className="gc-dot absolute inset-y-[2px] left-0 rounded-[2px]"
                    style={{
                      ...colorVars(recordLabelKeyHex(recordLabelKey(r.mainLog, labelPresets, logCategoryColors), logCategoryColors)),
                      width: `${(r.loggedMinutes / estimateMax) * 100}%`,
                    }}
                  />
                  <div
                    className={`absolute inset-y-0 left-0 rounded-[3px] ${PLANNED_FRAME}`}
                    style={{ width: `${(r.estimateMinutes / estimateMax) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** ラベル別の時間に添える前の期間との差（「+3h」「±0」）。短い書き方で、色は付けない */
function LabelDiff({ diff }: { diff: number }) {
  return (
    <span className="ml-1.5 inline-block min-w-[3.25rem] text-right text-[10px] text-zinc-400 dark:text-zinc-500">
      {diff === 0 ? '±0' : signed(diff, formatDurationShort)}
    </span>
  )
}
