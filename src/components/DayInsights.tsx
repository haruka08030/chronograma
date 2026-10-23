import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import {
  INSIGHT_DAYS,
  LATE_BED_OFFSET,
  LONG_SLEEP_MINUTES,
  MIN_RELATIVE_DIFF,
  MIN_SIDE_DAYS,
  SHORT_SLEEP_MINUTES,
  type DayInsight,
  type InsightSide,
} from '../lib/dayInsights'
import { colorVars, recordLabelKeyHex } from '../lib/logCategoryColors'
import { recordLabelKeyText } from '../lib/todoColorLabels'
import { formatDuration } from '../lib/timeGrid'
import { minutesToTime } from '../lib/clockTime'
import { MoodSymbol } from './today/DayMood'
import { META_TEXT } from './ui/textClass'

/** 気分の記号を並べる（名前は読み上げだけ） */
function MoodSymbols({ moods, label }: { moods: readonly (1 | 2 | 3 | 4 | 5)[]; label: string }) {
  return (
    <>
      <span className="sr-only">{label}</span>
      <span className="inline-flex items-center gap-px align-[-2px]" aria-hidden>
        {moods.map((m) => (
          <MoodSymbol key={m} mood={m} className="h-3 w-3" />
        ))}
      </span>
    </>
  )
}

/**
 * 睡眠カードの下の段「日の違い」（#326）。睡眠の長さ・寝た時刻・気分で分けた日どうしの、記録した時間や予定どおりの差。
 * 文ではなく「条件 → 数字」の 2 行で並べる。両側の日数も添える（何日から出した数字か分かるように）。
 * 棒は大きさの目安だけで、色は両側同じ（違いは文字で読む）
 */
export function DayInsightsSection({ rows }: { rows: readonly DayInsight[] }) {
  const { t } = useTranslation()
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const labelPresets = useTaskStore((s) => s.timeLogTagPresets)
  if (rows.length === 0) return null

  const hours = (m: number) => m / 60
  const conditionLabels = (row: DayInsight): [ReactNode, ReactNode] => {
    switch (row.condition) {
      case 'sleepLength':
        return [
          t('dayInsights.sleepUnder', { h: hours(SHORT_SLEEP_MINUTES) }),
          t('dayInsights.sleepAtLeast', { h: hours(LONG_SLEEP_MINUTES) }),
        ]
      case 'bedtime': {
        const time = minutesToTime((LATE_BED_OFFSET + 12 * 60) % (24 * 60)).replace(/^0(\d)/, '$1')
        return [t('dayInsights.bedAfter', { time }), t('dayInsights.bedBy', { time })]
      }
      case 'mood':
        return [
          <>
            <MoodSymbols moods={[4, 5]} label={t('dayInsights.moodGoodName')} /> {t('dayInsights.moodDays')}
          </>,
          <>
            <MoodSymbols moods={[1, 2]} label={t('dayInsights.moodBadName')} /> {t('dayInsights.moodDays')}
          </>,
        ]
    }
  }

  return (
    <section className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800" aria-labelledby="day-insights-title">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="day-insights-title" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {t('dayInsights.title')}
        </h3>
        <p className={META_TEXT}>{t('dayInsights.range', { days: INSIGHT_DAYS })}</p>
      </div>
      <ul className="mt-3 max-w-xl space-y-4">
        {rows.map((row) => {
          const isLabel = row.metric.kind === 'label'
          const hex = row.metric.kind === 'label' ? recordLabelKeyHex(row.metric.tag, logCategoryColors) : null
          const metricName =
            row.metric.kind === 'label'
              ? t('dayInsights.labelAvg', { label: recordLabelKeyText(row.metric.tag, labelPresets, logCategoryColors, t) })
              : row.metric.kind === 'follow'
                ? t('dayInsights.follow')
                : t('dayInsights.loggedAvg')
          const valueText = (side: InsightSide) =>
            row.metric.kind === 'follow' ? `${Math.round(side.value * 100)}%` : formatDuration(side.value)
          // 割合は 100% を、時間は両側の大きいほうを端にする
          const scale = row.metric.kind === 'follow' ? 1 : Math.max(row.a.value, row.b.value, 1)
          const [labelA, labelB] = conditionLabels(row)
          const sides: [ReactNode, InsightSide][] = [
            [labelA, row.a],
            [labelB, row.b],
          ]
          return (
            <li key={row.condition} data-day-insight={row.condition}>
              <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                {hex && <span className="gc-dot h-2 w-2 shrink-0 rounded-full" style={colorVars(hex)} aria-hidden />}
                <span className="min-w-0 truncate">{metricName}</span>
              </p>
              <div className="mt-1.5 grid grid-cols-[minmax(0,max-content)_minmax(2.5rem,1fr)_auto] items-center gap-x-2 gap-y-1.5 text-xs">
                {sides.map(([label, side], i) => (
                  <div key={i} className="contents">
                    <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">{label}</span>
                    <span className="relative h-2.5 rounded-sm bg-zinc-100 dark:bg-zinc-800" aria-hidden>
                      {side.value > 0 && (
                        <span
                          className={`absolute inset-y-0 left-0 rounded-sm ${isLabel ? 'gc-dot' : 'gc-plan'}`}
                          style={
                            {
                              ...(hex ? colorVars(hex) : { '--c': 'var(--color-sleep)' }),
                              width: `${Math.min(100, (side.value / scale) * 100)}%`,
                            } as CSSProperties
                          }
                        />
                      )}
                    </span>
                    <span className="whitespace-nowrap text-right tabular-nums">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{valueText(side)}</span>
                      <span className="ml-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                        {t('dayInsights.days', { count: side.days })}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        {t('dayInsights.note', { min: MIN_SIDE_DAYS, pct: Math.round(MIN_RELATIVE_DIFF * 100) })}
      </p>
    </section>
  )
}
