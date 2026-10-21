import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { adjustedMinutes, estimateBias } from '../lib/estimateActual'
import { unplannedListIds } from '../lib/listKind'
import { formatDuration } from '../lib/timeGrid'
import { useAppTodayKey } from '../hooks/useAppClock'
import { buttonClass } from './ui/buttonClass'
import { META_TEXT } from './ui/textClass'

/**
 * 見積もりのクセ（#417）: 「いつも 1.4 倍かかっています · 1時間30分にする」。押すとその長さにする（勝手には直さない）。
 * 倍率が出ない（記録が少ない・ほぼ見積もりどおり）・直しても同じ長さなら何も出さない。見積もりの欄と「時間を決める」で使う
 */
export function EstimateBiasHint({
  minutes,
  labelId,
  onApply,
  className = '',
}: {
  /** 今の長さ（分） */
  minutes: number
  /** その To-Do のラベル（無ければラベルなしの To-Do の倍率） */
  labelId: string | null
  onApply: (minutes: number) => void
  className?: string
}) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const lists = useTaskStore((s) => s.lists)
  const todayKey = useAppTodayKey()
  const bias = useMemo(() => estimateBias(tasks, labelId, unplannedListIds(lists), todayKey), [tasks, lists, labelId, todayKey])
  if (!bias || minutes <= 0) return null
  const next = adjustedMinutes(minutes, bias.ratio)
  if (next === minutes) return null
  const ratio = (Math.round(bias.ratio * 10) / 10).toFixed(1)
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 ${META_TEXT} ${className}`} data-estimate-bias>
      <span>{t(bias.byLabel && labelId ? 'estimateBias.label' : 'estimateBias.all', { ratio })}</span>
      <button type="button" onClick={() => onApply(next)} className={buttonClass({ variant: 'link', size: 'xs' }, 'tabular-nums')}>
        {t('estimateBias.apply', { time: formatDuration(next) })}
      </button>
    </p>
  )
}
