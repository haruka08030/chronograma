import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { readQuickAddText, type QuickAddOptions } from '../lib/quickAddTask'
import { recurrenceLabel } from '../lib/recurrenceLabel'
import { useDateFormat } from '../hooks/useDateFormat'
import { HINT_TEXT } from './ui/textClass'
import { formatDuration } from '../lib/timeGrid'

/**
 * 追加欄の下の「こう読みました」の 1 行（「締切 10/10 (土) 23:59 ・ @就活」「10/8 (木) 14:00–15:00」）。
 * 入力中だけ出し、何も読み取れなければ出さない（常時の説明にはしない）。読み方は足したときと同じ（`readQuickAddText`）
 */
export function QuickAddReading({
  text,
  defaultDate,
  className = '',
}: {
  text: string
  defaultDate?: QuickAddOptions['defaultDate']
  className?: string
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  // リストの名前が変わったら読み直す（読むときはストアから直接取る。表示言語は useTranslation で読み直す）
  useTaskStore((s) => s.lists)
  const line = (() => {
    const r = readQuickAddText(text, { defaultDate })
    if (!r) return null
    const parts: string[] = []
    if (r.plan) {
      const time = r.plan.endTime ? `${r.plan.startTime}–${r.plan.endTime}` : r.plan.startTime
      parts.push(`${df.shortDateWeekday(r.plan.date)} ${time}`)
    } else if (r.doDate) parts.push(t('quickAdd.reading.doDate', { date: df.shortDateWeekday(r.doDate) }))
    if (r.due) {
      const date = df.shortDateWeekday(r.due.date)
      parts.push(r.due.time ? t('quickAdd.reading.dueAt', { date, time: r.due.time }) : t('quickAdd.reading.due', { date }))
    }
    if (r.estimateMinutes != null) parts.push(t('quickAdd.reading.estimate', { time: formatDuration(r.estimateMinutes) }))
    if (r.recurrence) parts.push(recurrenceLabel(t, r.recurrence.rule, r.recurrence.firstDate))
    if (r.listName) parts.push(`@${r.listName}`)
    return parts.length > 0 ? parts.join(t('quickAdd.reading.separator')) : null
  })()

  if (!line) return null
  return (
    <p className={`truncate ${HINT_TEXT} ${className}`} title={line}>
      {line}
    </p>
  )
}
