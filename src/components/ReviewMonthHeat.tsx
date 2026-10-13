import { useMemo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { isSameMonth } from 'date-fns'
import type { WeekReviewDay } from '../lib/weekReview'
import { monthGridDays, weekdayLabelsFrom } from '../lib/weekStart'
import { useWeekStartsOn } from '../hooks/useWeekStartsOn'
import { useDateFormat } from '../hooks/useDateFormat'
import { toDateKey } from '../lib/dateKey'
import { formatDuration, formatDurationShort } from '../lib/timeGrid'
import { TODAY_TEXT } from '../lib/dayMarker'
import { tip } from '../lib/tooltip'

/** マスの色（濃さの段は `gc-heat` の `--heat` で。塗りは薄いまま、多い日ほど縁がくっきりする） */
const HEAT_STYLE = (level: number) => ({ '--c': 'var(--color-accent-500)', '--heat': level / 4 }) as CSSProperties

/** その日の記録（分）を濃さの段に。0 分は塗らない。いちばん多い日を最上段にして 4 段に分ける */
function heatLevel(minutes: number, maxMinutes: number): number {
  if (minutes <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((minutes / Math.max(60, maxMinutes)) * 4)))
}

/**
 * 月のふりかえりの「日ごとの記録時間」（#304）。週の棒の代わりに、日のマスの濃さで見せるカレンダー。
 * 色だけに頼らないよう、マスには記録の合計も短い書き方で出す（棒の上の数字と同じ）。押すとその日の今日の計画を開く。
 * 並びはカレンダーなので設定の週の開始日から（集計の月は暦の月で、並びには左右されない）
 */
export function ReviewMonthHeat({
  month,
  days,
  todayKey,
  onOpenDay,
}: {
  /** 月の 1 日 */
  month: Date
  /** その月の今日までの日（`getReview` の `days`） */
  days: readonly WeekReviewDay[]
  todayKey: string
  onOpenDay: (dateKey: string) => void
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const weekStartsOn = useWeekStartsOn()
  const weekdayLabels = weekdayLabelsFrom(t('calendar.weekdayInitials', { returnObjects: true }) as string[], weekStartsOn)
  const grid = useMemo(() => monthGridDays(month, weekStartsOn), [month, weekStartsOn])
  // 週の棒と同じく、記録の分類の積み上げの合計（`tagMinutes`）を 1 日の量にする
  const byKey = useMemo(() => new Map(days.map((d) => [d.dateKey, d])), [days])
  const minutesOf = (d: WeekReviewDay | undefined) => (d ? d.tagMinutes.reduce((a, x) => a + x.minutes, 0) : 0)
  const max = Math.max(0, ...days.map(minutesOf))

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-400 dark:text-zinc-500">
        {weekdayLabels.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.map((date) => {
          const key = toDateKey(date)
          if (!isSameMonth(date, month)) return <span key={key} aria-hidden />
          const day = byKey.get(key)
          const minutes = minutesOf(day)
          const future = key > todayKey
          const level = heatLevel(minutes, max)
          const label = df.monthDayWeekday(date)
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
            <button
              key={key}
              type="button"
              disabled={future}
              aria-label={dayTip}
              {...(future ? {} : tip(dayTip))}
              onClick={() => onOpenDay(key)}
              className={`flex h-11 min-w-0 flex-col justify-between rounded-md px-1 py-0.5 text-left transition-opacity enabled:hover:opacity-85 disabled:cursor-default ${
                level > 0 ? 'gc-heat' : 'border border-zinc-200 disabled:border-dashed dark:border-zinc-700/80'
              }`}
              style={level > 0 ? HEAT_STYLE(level) : undefined}
            >
              <span
                className={`text-[10px] leading-none tabular-nums ${
                  key === todayKey ? TODAY_TEXT : future ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {date.getDate()}
              </span>
              {minutes > 0 && (
                <span className="self-end whitespace-nowrap text-[10px] leading-none font-medium tabular-nums text-zinc-700 dark:text-zinc-200">
                  {formatDurationShort(minutes)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
