import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, format } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import { summarizeSleep, type SleepNight } from '../lib/sleep'
import { appTodayKey } from '../lib/timeZone'
import { TODAY_TEXT } from '../lib/dayMarker'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { formatDuration } from '../lib/timeGrid'
import { useDateFormat } from '../hooks/useDateFormat'

const DAYS = 14
const CHART_HEIGHT = 144

/**
 * 統計の「睡眠」。直近 14 日の平均（睡眠時間・寝た時刻・起きた時刻とそのばらつき）と、
 * 夜ごとの「寝た → 起きた」を縦の帯で並べた図。帯の上下がそろっているほど規則正しい。
 * 睡眠の記録が無い期間は出さない。
 */
export function SleepStatsCard() {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const df = useDateFormat()
  const todayKey = appTodayKey()
  const summary = useMemo(() => summarizeSleep(tasks, todayKey, DAYS), [tasks, todayKey])
  const [focusKey, setFocusKey] = useState<string | null>(null)

  if (summary.count === 0) return null

  const nights = summary.nights.filter((n): n is SleepNight => n !== null)
  // 縦軸: 寝た時刻〜起きた時刻が全部入る範囲。上下の端を目盛りにそろえる（最低 8 時間ぶん）
  const minBed = Math.min(...nights.map((n) => n.bedOffset))
  const maxWake = Math.max(...nights.map((n) => n.wakeOffset))
  const step = maxWake - minBed > 10 * 60 ? 180 : 120
  const lo = Math.floor(minBed / step) * step
  const hi = Math.max(Math.ceil(maxWake / step) * step, lo + 8 * 60)
  const span = hi - lo
  const ticks: number[] = []
  for (let m = lo; m <= hi; m += step) ticks.push(m)
  const y = (off: number) => ((off - lo) / span) * CHART_HEIGHT
  const clockLabel = (off: number) => `${((off / 60 + 12) % 24).toFixed(0)}:00`

  const dayLabel = (key: string) => df.shortDateWeekday(key)
  const spreadText = (m: number | null) => (summary.count >= 2 && m != null ? t('sleepStats.spread', { m }) : null)

  const tiles = [
    { label: t('sleepStats.avgSleep'), value: formatDuration(summary.avgMinutes ?? 0), sub: null },
    { label: t('sleepStats.avgBed'), value: summary.avgBed ?? '—', sub: spreadText(summary.bedSpread) },
    { label: t('sleepStats.avgWake'), value: summary.avgWake ?? '—', sub: spreadText(summary.wakeSpread) },
  ]

  // 図の上の読み取り行: 押した・ホバーした夜、なければいちばん新しい夜
  const focused = nights.find((n) => n.dateKey === focusKey) ?? nights[nights.length - 1]!

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t('sleepStats.title')}</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('sleepStats.range', { days: DAYS, count: summary.count })}</p>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="min-w-0 rounded-lg bg-zinc-50 px-2.5 py-2.5 dark:bg-zinc-800/60 sm:px-3">
            <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">{tile.label}</dt>
            <dd className="mt-0.5 whitespace-nowrap text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 sm:text-lg">
              {tile.value}
              {tile.sub && <span className="ml-1 text-[11px] font-normal text-zinc-400 dark:text-zinc-500">{tile.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <figure className="mt-5">
        <figcaption className="mb-2 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">{t('sleepStats.chartTitle')}</span>
          <span className="tabular-nums text-zinc-500 dark:text-zinc-400" aria-live="polite">
            {dayLabel(focused.dateKey)} {focused.bed}–{focused.wake} · {formatDuration(focused.minutes)}
          </span>
        </figcaption>
        <div className="flex gap-2">
          {/* 縦軸（上が寝る側、下が起きる側） */}
          <div className="relative w-9 shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500" style={{ height: CHART_HEIGHT }} aria-hidden>
            {ticks.map((m) => (
              <span key={m} className="absolute right-0 -translate-y-1/2" style={{ top: y(m) }}>
                {clockLabel(m)}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative" style={{ height: CHART_HEIGHT }}>
              {ticks.map((m) => (
                <div key={m} className="absolute left-0 right-0 border-t border-zinc-100 dark:border-zinc-800" style={{ top: y(m) }} aria-hidden />
              ))}
              <div className="absolute inset-0 flex gap-0.5" onPointerLeave={() => setFocusKey(null)}>
                {summary.nights.map((n, i) => (
                  <button
                    key={n?.dateKey ?? `empty-${i}`}
                    type="button"
                    disabled={!n}
                    tabIndex={n ? 0 : -1}
                    aria-hidden={!n}
                    aria-label={n ? `${dayLabel(n.dateKey)} ${n.bed}–${n.wake} ${formatDuration(n.minutes)}` : undefined}
                    onPointerEnter={() => n && setFocusKey(n.dateKey)}
                    onFocus={() => n && setFocusKey(n.dateKey)}
                    onClick={() => n && setFocusKey(n.dateKey)}
                    className="group relative flex-1 cursor-default rounded-md outline-none focus-visible:bg-zinc-100 dark:focus-visible:bg-zinc-800"
                  >
                    {n && (
                      <span
                        className={`absolute left-1/2 w-2.5 -translate-x-1/2 rounded bg-sleep transition-opacity sm:w-3 ${
                          focused.dateKey === n.dateKey ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
                        }`}
                        style={{ top: y(n.bedOffset), height: Math.max(y(n.wakeOffset) - y(n.bedOffset), 4) }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-1 flex gap-0.5 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500" aria-hidden>
              {summary.nights.map((_, i) => {
                const d = addDays(fromDateKey(todayKey), i - (DAYS - 1))
                const key = toDateKey(d)
                // 1 日おきに日付（最後＝今日は必ず）。月初は「10/1」
                const show = (DAYS - 1 - i) % 2 === 0
                return (
                  <span key={key} className={`flex-1 text-center ${key === todayKey ? TODAY_TEXT : ''}`}>
                    {show ? (d.getDate() === 1 ? format(d, 'M/d') : d.getDate()) : ''}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
        <table className="sr-only">
          <caption>{t('sleepStats.chartTitle')}</caption>
          <thead>
            <tr>
              <th>{t('sleepStats.colDate')}</th>
              <th>{t('sleepStats.avgBed')}</th>
              <th>{t('sleepStats.avgWake')}</th>
              <th>{t('sleepStats.avgSleep')}</th>
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
    </section>
  )
}
