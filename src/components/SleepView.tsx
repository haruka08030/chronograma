import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { defaultSleepTimes, sleepNightOn, sleepPeriods, totalSleepMinutes, weekendGap, type SleepPeriod } from '../lib/sleep'
import { SLEEP_GOAL_HOURS } from '../lib/sleepPrefs'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { formatDuration } from '../lib/timeGrid'
import { TODAY_TEXT } from '../lib/dayMarker'
import { useDateFormat } from '../hooks/useDateFormat'
import { useAppTodayKey } from '../hooks/useAppClock'
import { useRememberScroll } from '../hooks/useRememberScroll'
import { SleepStatsCard } from './SleepStatsCard'
import { NapPlus, SleepBar, SleepDayEditor } from './SleepTimesField'
import { TimeInput } from './TimeInput'
import { ShowMoreButton } from './ui/ShowMoreButton'
import { SettingsRow } from './settings/SettingsPrimitives'
import { fieldClass } from './ui/fieldClass'
import { buttonClass } from './ui/buttonClass'
import { CARD_TITLE_CLASS, PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { META_TEXT } from './ui/textClass'

const CARD_CLASS = 'rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50'
/** 夜ごとの一覧に最初に並べる夜の数（「さらに表示」で同じだけ足す） */
const NIGHTS_PAGE = 30
/** 一覧をさかのぼる上限（1 年） */
const NIGHTS_MAX = 366

/**
 * 睡眠のページ（#628）。今日の計画の睡眠の行の ☾ と、統計の睡眠のカードから開く（サイドバー・下のタブには出さない）。
 * 上から: 直近 14 日（統計にあった睡眠のカード: 時計・平均とばらつき・夜ごとの図・日の違い）、週・月ごとの平均と平日と土日の差、
 * 夜ごとの一覧（押すとその夜を直す・記録の無い夜は入れる）、睡眠の設定（いつもの時刻・目標の睡眠時間。端末に保存）
 */
export function SleepView() {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  useRememberScroll(scrollRef, 'sleep')
  return (
    <div ref={scrollRef} className={PAGE_SCROLL_CLASS}>
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pt-4 pb-24 md:px-6 md:pt-8">
        <h1 className={PAGE_TITLE_CLASS}>{t('sidebar.views.sleep')}</h1>
        {/* ページの題名が「睡眠」なので、カードの見出しは出さない */}
        <SleepStatsCard showTitle={false} />
        <SleepPeriodsCard />
        <SleepNightsCard />
        <SleepPrefsCard />
      </div>
    </div>
  )
}

/** 週・月ごとの平均（睡眠時間と昼寝・寝た・起きた・日数、目標があれば昼寝も足した長さと目標との差）と、平日と土日の差 */
function SleepPeriodsCard() {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const goal = useTaskStore((s) => s.sleepPrefs.goalMinutes)
  const todayKey = useAppTodayKey()
  const periods = useMemo(() => sleepPeriods(tasks, todayKey), [tasks, todayKey])
  const gap = useMemo(() => weekendGap(tasks, todayKey), [tasks, todayKey])
  const monthName = useMemo(() => new Intl.DateTimeFormat(i18n.language, { month: 'long' }), [i18n.language])
  if (periods.every((p) => p.summary.count === 0)) return null

  const periodName = (p: SleepPeriod) => {
    if (p.kind === 'month') return monthName.format(fromDateKey(p.startKey))
    if (p.ago === 0) return t('sleepPage.thisWeek')
    if (p.ago === 1) return t('sleepPage.lastWeek')
    return t('sleepPage.weeksAgo', { count: p.ago })
  }
  const diff = (m: number) => `${m >= 0 ? '+' : '−'}${formatDuration(Math.abs(m))}`
  const gapText = (later: number, k: 'bed' | 'wake') =>
    Math.abs(later) < 15 ? null : t(`sleepPage.${k}${later > 0 ? 'Later' : 'Earlier'}`, { time: formatDuration(Math.abs(later)) })
  const gapParts = gap ? [gapText(gap.bedLater, 'bed'), gapText(gap.wakeLater, 'wake')].filter(Boolean) : []

  const row = (p: SleepPeriod, first: boolean) => {
    const s = p.summary
    // 月の最初の行の上は太い線（週と月の区切り）
    const border =
      first && p.kind === 'month' ? 'border-t border-zinc-200 dark:border-zinc-700' : 'border-t border-zinc-100 dark:border-zinc-800'
    return (
      <tr key={`${p.kind}-${p.ago}`} className={border}>
        <th scope="row" className={`py-2 pr-2 text-left font-normal ${p.ago === 0 ? TODAY_TEXT : 'text-zinc-600 dark:text-zinc-300'}`}>
          {periodName(p)}
        </th>
        {s.count === 0 ? (
          <td colSpan={goal ? 5 : 4} className={`py-2 ${META_TEXT}`}>
            {t('sleepPage.noRecord')}
          </td>
        ) : (
          <>
            <td className="py-2 pr-2">
              <span className="whitespace-nowrap font-semibold text-zinc-900 dark:text-zinc-100">{formatDuration(s.avgMinutes ?? 0)}</span>
              <NapPlus minutes={s.avgNapMinutes ?? 0} className="ml-1.5 inline-block text-[11px]" />
            </td>
            <td className="py-2 pr-2 text-zinc-600 dark:text-zinc-300">{s.avgBed}</td>
            <td className="py-2 pr-2 text-zinc-600 dark:text-zinc-300">{s.avgWake}</td>
            <td className="whitespace-nowrap py-2 pr-2 text-zinc-400 dark:text-zinc-500">
              {t('sleepPage.nightsCount', { count: s.count })}
            </td>
            {goal && (
              <td className="whitespace-nowrap py-2 text-zinc-500 dark:text-zinc-400">
                {diff((s.avgMinutes ?? 0) + (s.avgNapMinutes ?? 0) - goal)}
              </td>
            )}
          </>
        )}
      </tr>
    )
  }
  const colHead = 'pb-1 pr-2 text-left text-[11px] font-normal text-zinc-400 dark:text-zinc-500'
  return (
    <section className={CARD_CLASS}>
      <h2 className={CARD_TITLE_CLASS}>{t('sleepPage.periodsTitle')}</h2>
      <table className="mt-3 w-full text-xs tabular-nums">
        <thead>
          <tr>
            <th className={colHead}>
              <span className="sr-only">{t('sleepPage.colPeriod')}</span>
            </th>
            <th className={colHead}>{t('sleepPage.colSleep')}</th>
            <th className={colHead}>{t('sleepStats.bed')}</th>
            <th className={colHead}>{t('sleepStats.wake')}</th>
            <th className={colHead}>{t('sleepPage.colNights')}</th>
            {goal && <th className={colHead}>{t('sleepPage.goalDiff')}</th>}
          </tr>
        </thead>
        <tbody>{periods.map((p, i) => row(p, i === 0 || periods[i - 1]!.kind !== p.kind))}</tbody>
      </table>
      {gap && (
        <p className={`mt-4 ${META_TEXT}`}>
          {t('sleepPage.weekendGap', { parts: gapParts.length > 0 ? gapParts.join(t('common.listSeparator')) : t('sleepPage.sameTime') })}
        </p>
      )}
    </section>
  )
}

/**
 * 夜ごとの一覧（新しい順）。押すとその夜の下で時刻を直せ（昼寝も）、記録の無い夜は入れられる。
 * 昼寝は長さの右に「＋昼寝 ◯」。目標があれば、昼寝も足して届かなかった夜に差を添える
 */
function SleepNightsCard() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const goal = useTaskStore((s) => s.sleepPrefs.goalMinutes)
  const todayKey = useAppTodayKey()
  const df = useDateFormat()
  const [shown, setShown] = useState(NIGHTS_PAGE)
  const [editKey, setEditKey] = useState<string | null>(null)

  // 一番古い記録の夜より前は並べない（使い始める前の「記録なし」を何十行も出さない）
  const nights = useMemo(() => {
    const today = fromDateKey(todayKey)
    const out = []
    for (let i = 0; i < NIGHTS_MAX; i++) {
      const dateKey = toDateKey(addDays(today, -i))
      out.push({ dateKey, night: sleepNightOn(tasks, dateKey) })
    }
    let last = out.length - 1
    while (last > 0 && !out[last]!.night) last--
    return out.slice(0, last + 1)
  }, [tasks, todayKey])
  if (!nights.some((n) => n.night)) return null

  return (
    <section className={CARD_CLASS}>
      <h2 className={CARD_TITLE_CLASS}>{t('sleepPage.nightsTitle')}</h2>
      <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
        {nights.slice(0, shown).map(({ dateKey, night: n }) => {
          const short = goal && n ? goal - totalSleepMinutes(n) : 0
          const editing = editKey === dateKey
          return (
            <li key={dateKey}>
              <button
                type="button"
                aria-expanded={editing}
                aria-label={
                  n
                    ? `${df.shortDateWeekday(dateKey)} ${n.bed}–${n.wake} ${formatDuration(n.minutes)}${
                        n.napMinutes > 0 ? ` ${t('sleep.napPlus', { time: formatDuration(n.napMinutes) })}` : ''
                      }`
                    : t('sleepStats.fillAria', { day: df.shortDateWeekday(dateKey) })
                }
                onClick={() => setEditKey(editing ? null : dateKey)}
                className="-mx-2 flex w-[calc(100%+1rem)] flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md sm:gap-x-3 px-2 py-2 text-left text-xs tabular-nums hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <span
                  className={`w-16 shrink-0 whitespace-nowrap ${dateKey === todayKey ? TODAY_TEXT : n ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-300 dark:text-zinc-600'}`}
                >
                  {df.shortDateWeekday(dateKey)}
                </span>
                {n ? (
                  <>
                    <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                      <span>{n.bed}</span>
                      {/* スマホ幅は線を短い記号にして、目標との差まで 1 行に収める */}
                      <span className="hidden sm:inline-flex">
                        <SleepBar />
                      </span>
                      <span className="sm:hidden" aria-hidden>
                        –
                      </span>
                      <span>{n.wake}</span>
                    </span>
                    <span className="whitespace-nowrap font-medium text-zinc-900 dark:text-zinc-100">{formatDuration(n.minutes)}</span>
                    <NapPlus minutes={n.napMinutes} />
                    {short > 0 && (
                      <span className="ml-auto whitespace-nowrap text-zinc-400 dark:text-zinc-500">
                        {t('sleepPage.belowGoal', { time: formatDuration(short) })}
                      </span>
                    )}
                  </>
                ) : (
                  <span className={META_TEXT}>{t('sleepPage.noRecord')}</span>
                )}
              </button>
              {editing && (
                <div className="mb-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                  <SleepDayEditor
                    dateKey={dateKey}
                    label={t('sleepStats.editTitle', { day: df.shortDateWeekday(dateKey) })}
                    onDone={() => setEditKey(null)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {shown < nights.length && <ShowMoreButton onClick={() => setShown((n) => n + NIGHTS_PAGE)} remaining={nights.length - shown} />}
    </section>
  )
}

/** 睡眠の設定: いつもの時刻（まだ記録の無い朝の欄に最初に入る）と目標の睡眠時間 */
function SleepPrefsCard() {
  const { t } = useTranslation()
  const prefs = useTaskStore((s) => s.sleepPrefs)
  const setSleepPrefs = useTaskStore((s) => s.setSleepPrefs)
  const tasks = useTaskStore((s) => s.tasks)
  const inputClass = `w-[4.5rem] ${fieldClass({ size: 'sm' })}`
  const usualSet = Boolean(prefs.usualBed && prefs.usualWake)
  return (
    <section className={CARD_CLASS}>
      <h2 className={CARD_TITLE_CLASS}>{t('sleepPage.prefsTitle')}</h2>
      <div className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
        <SettingsRow label={t('sleepPage.usual')} help={t('sleepPage.usualHelp')}>
          {usualSet ? (
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              <span role="group" aria-label={t('sleepPage.usual')} className="inline-flex items-center gap-1.5">
                <span className="sr-only">{t('sleep.bedAria')}</span>
                <TimeInput
                  value={prefs.usualBed!}
                  onChange={(v) => v && v !== prefs.usualWake && setSleepPrefs({ usualBed: v })}
                  className={inputClass}
                />
                <SleepBar />
                <span className="sr-only">{t('sleep.wakeAria')}</span>
                <TimeInput
                  value={prefs.usualWake!}
                  onChange={(v) => v && v !== prefs.usualBed && setSleepPrefs({ usualWake: v })}
                  durationFrom={prefs.usualBed!}
                  overnight
                  className={inputClass}
                />
              </span>
              <button
                type="button"
                onClick={() => setSleepPrefs({ usualBed: null, usualWake: null })}
                className={buttonClass({ variant: 'ghost', size: 'sm' })}
              >
                {t('sleepPage.usualClear')}
              </button>
            </span>
          ) : (
            <button
              type="button"
              // 決めるときは前回の時刻から始める
              onClick={() => {
                const last = defaultSleepTimes(tasks)
                setSleepPrefs({ usualBed: last.bed, usualWake: last.wake })
              }}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              {t('sleepPage.usualSet')}
            </button>
          )}
        </SettingsRow>
        <SettingsRow label={t('sleepPage.goal')} help={t('sleepPage.goalHelp')} htmlFor="sleep-goal">
          <select
            id="sleep-goal"
            value={prefs.goalMinutes ?? ''}
            onChange={(e) => setSleepPrefs({ goalMinutes: e.target.value ? Number(e.target.value) : null })}
            className={fieldClass({ size: 'sm' })}
          >
            <option value="">{t('sleepPage.goalNone')}</option>
            {SLEEP_GOAL_HOURS.map((h) => (
              <option key={h} value={h * 60}>
                {formatDuration(h * 60)}
              </option>
            ))}
          </select>
        </SettingsRow>
      </div>
    </section>
  )
}
