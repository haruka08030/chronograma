import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { SERIES_SCOPES, hasOtherOccurrences } from '../../lib/eventSeries'
import { useDateFormat } from '../../hooks/useDateFormat'
import type { EventSeries, Task } from '../../types/task'
import { PillToggle } from '../ui/PillToggle'
import { RepeatIcon } from '../icons'
import { META_TEXT } from '../ui/textClass'

/** 予定のカードの繰り返しの 1 行（「毎週 月・水 · 2026年7月31日まで」、祝日を除くなら「· 祝日を除く」） */
export function SeriesSummary({ series }: { series: EventSeries }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const labels = t('habits.weekdays', { returnObjects: true }) as string[]
  const days = series.weekdays.map((d) => labels[d - 1]).join(t('eventSeries.weekdaySeparator'))
  const parts = [t('eventSeries.weekly', { days }), t('eventSeries.until', { date: df.fullDate(series.until) })]
  if (series.skipHolidays) parts.push(t('eventSeries.skipHolidaysShort'))
  const text = parts.join(' · ')
  return (
    <p className={`flex items-center gap-1.5 ${META_TEXT}`}>
      <RepeatIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {text}
    </p>
  )
}

/**
 * 毎週の予定のカード・詳細で、直す範囲を選ぶピル（Google カレンダーの「この予定 / これ以降のすべての予定 / すべての予定」）。
 * 既定は「この予定のみ」。選んだ範囲はストアの `seriesEditScope` に置き、`updateTask` がほかの回にも写す。閉じたら戻す。
 * ほかに回の無い予定（繰り返さない予定・最後の 1 回）には出さない
 */
export function SeriesScopeField({ task }: { task: Task }) {
  const { t } = useTranslation()
  const show = useTaskStore((s) => hasOtherOccurrences(s.tasks, task))
  const scope = useTaskStore((s) => (s.seriesEditScope?.taskId === task.id ? s.seriesEditScope.scope : 'one'))
  const setSeriesEditScope = useTaskStore((s) => s.setSeriesEditScope)
  useEffect(() => () => setSeriesEditScope(task.id, null), [task.id, setSeriesEditScope])
  if (!show) return null
  return (
    <div>
      <p className={`mb-1.5 ${META_TEXT}`}>{t('eventSeries.editScopeLabel')}</p>
      <PillToggle
        ariaLabel={t('eventSeries.editScopeLabel')}
        options={SERIES_SCOPES.map((s) => ({ value: s, label: t(`eventSeries.scope.${s}`) }))}
        value={scope}
        onChange={(s) => setSeriesEditScope(task.id, s)}
      />
    </div>
  )
}
