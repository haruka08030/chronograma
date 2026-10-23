import { useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { sleepEndingOn, summarizeSleep, type SleepNight } from '../lib/sleep'
import { TODAY_TEXT } from '../lib/dayMarker'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { formatDuration } from '../lib/timeGrid'
import { useDateFormat } from '../hooks/useDateFormat'
import { CARD_TITLE_CLASS } from './ui/headingClass'
import { META_TEXT } from './ui/textClass'
import { useAppTodayKey } from '../hooks/useAppClock'
import { SleepMoonIcon, SleepTimesField } from './SleepTimesField'
import { SunIcon } from './icons'
import { DayInsightsSection } from './DayInsights'
import { useDayInsights } from '../hooks/useDayInsights'

const DAYS = 14
/** 「正午からの分」（SleepNight の bedOffset / wakeOffset）を hh:00 の目盛りの文字に */
const clockLabel = (off: number) => `${((off / 60 + 12) % 24).toFixed(0)}:00`
const SLEEP_VARS = { '--c': 'var(--color-sleep)' } as CSSProperties
const SunMark = () => <SunIcon className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" />

/**
 * 統計の「睡眠」（#577）。上に要約、下に夜ごとの横の帯。
 * - 要約: 左に小さい 24 時間の時計（夜ごとの円弧を外へ重ね、いちばん外＝最新を濃く。重なりがそろうほど規則正しい）、
 *   右に平均の睡眠時間を大きく、☾ 寝た・☀ 起きた（平均と ±ばらつき）
 * - 夜ごとの図: 新しい夜が上。行頭は「23 金」、土日の行はうっすら色。時刻の目盛りは上、いつもの寝た・起きたは ☾・☀ の点線。
 *   長さは帯のすぐ右。今日の計画の睡眠の行（☾ 23:30 ▬ 07:00）と同じ横の帯の形
 * 行を押すとその夜の時刻を図の下で直せ、記録の無い夜（日付だけ薄く）を押すとその夜を埋められる。
 * 入力欄は今日の計画の睡眠の行と同じ部品（SleepTimesField）。
 * 下の段は「日の違い」（#326）。直近 14 日に睡眠の記録が無くても、日の違いが出せるなら見出しと下の段だけ出す
 */
export function SleepStatsCard() {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const df = useDateFormat()
  const todayKey = useAppTodayKey()
  const summary = useMemo(() => summarizeSleep(tasks, todayKey, DAYS), [tasks, todayKey])
  const [focusKey, setFocusKey] = useState<string | null>(null)
  // 入力欄を開いている夜（起きた日）
  const [editKey, setEditKey] = useState<string | null>(null)
  const insights = useDayInsights()
  const weekday = useMemo(() => new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }), [i18n.language])

  if (summary.count === 0) {
    if (insights.length === 0) return null
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h2 className={CARD_TITLE_CLASS}>{t('sleepStats.title')}</h2>
        <DayInsightsSection rows={insights} />
      </section>
    )
  }

  const nights = summary.nights.filter((n): n is SleepNight => n !== null)
  // 横軸: 寝た時刻〜起きた時刻が全部入る範囲。左右の端を目盛りにそろえる（最低 8 時間ぶん）
  const minBed = Math.min(...nights.map((n) => n.bedOffset))
  const maxWake = Math.max(...nights.map((n) => n.wakeOffset))
  const step = maxWake - minBed > 10 * 60 ? 180 : 120
  const lo = Math.floor(minBed / step) * step
  const hi = Math.max(Math.ceil(maxWake / step) * step, lo + 8 * 60)
  const ticks: number[] = []
  for (let m = lo; m <= hi; m += step) ticks.push(m)
  const x = (off: number) => `${((off - lo) / (hi - lo)) * 100}%`
  const avgBedOffset = nights.reduce((a, n) => a + n.bedOffset, 0) / nights.length
  const avgWakeOffset = nights.reduce((a, n) => a + n.wakeOffset, 0) / nights.length

  const dayLabel = (key: string) => df.shortDateWeekday(key)
  const spreadText = (m: number | null) => (summary.count >= 2 && m != null ? t('sleepStats.spread', { m }) : null)

  // 図の上の読み取り行: 直している・押した・ホバーした夜（記録の無い夜も）、なければいちばん新しい夜
  const activeKey = editKey ?? focusKey
  const focusedKey = activeKey ?? nights[nights.length - 1]!.dateKey
  const focused = nights.find((n) => n.dateKey === focusedKey) ?? null
  const editRecord = editKey ? sleepEndingOn(tasks, editKey) : null

  // 新しい夜を上に
  const rows = summary.nights.map((n, i) => ({ night: n, date: addDays(fromDateKey(todayKey), i - (DAYS - 1)) })).reverse()

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={CARD_TITLE_CLASS}>{t('sleepStats.title')}</h2>
        <p className={META_TEXT}>{t('sleepStats.range', { days: DAYS, count: summary.count })}</p>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <SleepClock nights={summary.nights} />
        <dl className="grid min-w-0 gap-2.5">
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">{t('sleepStats.avgSleep')}</dt>
            <dd className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              {formatDuration(summary.avgMinutes ?? 0)}
            </dd>
            <span className="text-xs text-zinc-500 dark:text-zinc-400" aria-hidden>
              {t('sleepStats.avg')}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(
              [
                [<SleepMoonIcon key="m" />, t('sleepStats.avgBed'), t('sleepStats.bed'), summary.avgBed, summary.bedSpread],
                [<SunMark key="s" />, t('sleepStats.avgWake'), t('sleepStats.wake'), summary.avgWake, summary.wakeSpread],
              ] as const
            ).map(([icon, name, caption, value, spread]) => (
              <div key={name} className="grid gap-0.5">
                <dt className="sr-only">{name}</dt>
                <dd className="flex items-baseline gap-1.5 whitespace-nowrap tabular-nums">
                  <span className="self-center">{icon}</span>
                  <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{value ?? '—'}</span>
                  {spreadText(spread) && <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{spreadText(spread)}</span>}
                </dd>
                <span className="pl-5 text-[11px] text-zinc-400 dark:text-zinc-500" aria-hidden>
                  {caption}
                </span>
              </div>
            ))}
          </div>
        </dl>
      </div>

      <figure className="mt-5">
        <figcaption className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="sr-only">{t('sleepStats.chartTitle')}</span>
          <span className="ml-auto tabular-nums text-zinc-500 dark:text-zinc-400" aria-live="polite">
            {focused
              ? `${dayLabel(focused.dateKey)} ${focused.bed}–${focused.wake} · ${formatDuration(focused.minutes)}`
              : `${dayLabel(focusedKey)} ${t('sleepStats.noRecord')}`}
          </span>
        </figcaption>
        {/* 行の地は透ける色（土日・ホバー・選択中）にして、目盛りと ☾・☀ の点線を隠さない */}
        {/* 行頭の日付（3rem）・帯の領域・右に長さの文字ぶんの余白（4.5rem） */}
        <div className="relative pl-12 pr-[4.5rem]">
          {/* 上の目盛りと、いつもの寝た・起きた（☾・☀ の点線） */}
          <div className="relative h-8 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500" aria-hidden>
            {ticks.map((m) => (
              <span key={m} className="absolute bottom-0.5 -translate-x-1/2" style={{ left: x(m) }}>
                {clockLabel(m)}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-12 right-[4.5rem]" aria-hidden>
            {ticks.map((m) => (
              <span key={m} className="absolute bottom-0 top-8 border-l border-zinc-100 dark:border-zinc-800" style={{ left: x(m) }} />
            ))}
            {(
              [
                [avgBedOffset, <SleepMoonIcon key="m" />],
                [avgWakeOffset, <SunMark key="s" />],
              ] as const
            ).map(([off, icon], i) => (
              <span key={i} className="absolute inset-y-0" style={{ left: x(off) }}>
                <span className="absolute top-0 -translate-x-1/2">{icon}</span>
                <span className="absolute bottom-0 top-8 border-l border-dashed border-sleep/50" />
              </span>
            ))}
          </div>
          <div onPointerLeave={() => setFocusKey(null)}>
            {rows.map(({ night: n, date }) => {
              const key = toDateKey(date)
              const active = focusedKey === key
              const dow = date.getDay()
              const isToday = key === todayKey
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={
                    n
                      ? `${dayLabel(key)} ${n.bed}–${n.wake} ${formatDuration(n.minutes)}`
                      : t('sleepStats.fillAria', { day: dayLabel(key) })
                  }
                  aria-expanded={editKey === key}
                  onPointerEnter={() => setFocusKey(key)}
                  onFocus={() => setFocusKey(key)}
                  onClick={() => {
                    setFocusKey(key)
                    setEditKey((k) => (k === key ? null : key))
                  }}
                  className={`group relative -ml-12 -mr-[4.5rem] block h-7 w-[calc(100%+7.5rem)] rounded-md outline-none hover:bg-zinc-500/[0.08] focus-visible:bg-zinc-500/[0.1] dark:hover:bg-zinc-400/[0.08] ${
                    dow === 0 || dow === 6 ? 'bg-zinc-500/[0.04] dark:bg-zinc-400/[0.04]' : ''
                  } ${active && activeKey ? 'bg-zinc-500/[0.08] dark:bg-zinc-400/[0.08]' : ''}`}
                >
                  <span
                    className={`absolute left-1 top-1/2 -translate-y-1/2 text-xs tabular-nums ${
                      isToday ? TODAY_TEXT : n ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-300 dark:text-zinc-600'
                    }`}
                    aria-hidden
                  >
                    {date.getDate()} {weekday.format(date)}
                  </span>
                  {n && (
                    <span className="absolute inset-y-0 left-12 right-[4.5rem]" aria-hidden>
                      <span
                        className={`gc-plan absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full outline-sleep ${
                          active && activeKey ? 'outline outline-2' : 'group-hover:outline group-hover:outline-2'
                        }`}
                        style={{ ...SLEEP_VARS, left: x(n.bedOffset), width: `calc(${x(n.wakeOffset)} - ${x(n.bedOffset)})` }}
                      />
                      <span
                        className="absolute top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400"
                        style={{ left: x(n.wakeOffset) }}
                      >
                        {formatDuration(n.minutes)}
                      </span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
        {editKey && (
          <div className="mt-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <SleepTimesField
              // 夜・記録が変わるたびに下書きを作り直す
              key={`${editKey}|${editRecord?.id ?? ''}`}
              dateKey={editKey}
              record={editRecord}
              label={t('sleepStats.editTitle', { day: dayLabel(editKey) })}
              onSaved={() => setEditKey(null)}
              onCancel={() => setEditKey(null)}
            />
          </div>
        )}
        <table className="sr-only">
          <caption>{t('sleepStats.chartTitle')}</caption>
          <thead>
            <tr>
              <th>{t('sleepStats.colDate')}</th>
              <th>{t('sleepStats.colBed')}</th>
              <th>{t('sleepStats.colWake')}</th>
              <th>{t('sleepStats.colSleep')}</th>
            </tr>
          </thead>
          <tbody>
            {nights.map((n) => (
              <tr key={n.dateKey}>
                <td>{dayLabel(n.dateKey)}</td>
                <td>{n.bed}</td>
                <td>{n.wake}</td>
                <td>{formatDuration(n.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
      <DayInsightsSection rows={insights} />
    </section>
  )
}

const DAY_MIN = 24 * 60

/**
 * 要約の小さい 24 時間の時計（真上が 0 時）。夜ごとの「寝た → 起きた」を円弧で内から外へ重ね、いちばん外の最新の夜を濃く。
 * 円弧の重なりがそろうほど規則正しい（細かい時刻は下の帯で読む）
 */
function SleepClock({ nights }: { nights: readonly (SleepNight | null)[] }) {
  const R = 76
  // 正午からの分 → 角度（真上が 0 時、時計回り）
  const angle = (off: number) => (((off + 12 * 60) % DAY_MIN) / DAY_MIN) * Math.PI * 2 - Math.PI / 2
  const point = (r: number, a: number) => [r * Math.cos(a), r * Math.sin(a)] as const
  const arc = (r: number, from: number, to: number) => {
    const [x1, y1] = point(r, angle(from))
    const [x2, y2] = point(r, angle(to))
    return `M${x1},${y1} A${r},${r} 0 ${to - from > DAY_MIN / 2 ? 1 : 0} 1 ${x2},${y2}`
  }
  const last = nights.length - 1
  return (
    <svg viewBox="-80 -80 160 160" className="w-28 shrink-0 sm:w-32" aria-hidden>
      <circle r={R} fill="none" className="stroke-zinc-200 dark:stroke-zinc-700" />
      {[0, 6, 12, 18].map((h) => {
        const [tx, ty] = point(66, (h / 24) * Math.PI * 2 - Math.PI / 2)
        return (
          <text key={h} x={tx} y={ty + 3.5} textAnchor="middle" fontSize={10} className="fill-zinc-400 dark:fill-zinc-500">
            {h}
          </text>
        )
      })}
      {nights.map((n, i) =>
        n ? (
          <path
            key={n.dateKey}
            d={arc(14 + i * 3.4, n.bedOffset, n.wakeOffset)}
            fill="none"
            stroke={i === last ? 'var(--color-sleep)' : 'color-mix(in srgb, var(--color-sleep) 45%, transparent)'}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        ) : null,
      )}
    </svg>
  )
}
