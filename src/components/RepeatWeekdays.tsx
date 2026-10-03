import { useTranslation } from 'react-i18next'
import type { Recurrence } from '../types/task'
import { PillToggle } from './ui/PillToggle'
import { isoWeekday, recurrenceWeekdays } from '../lib/recurrence'
import { fromDateKey } from '../lib/dateKey'

/** 月曜から日曜（1=月 … 7=日。習慣の曜日と同じ並び） */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 7]

/**
 * 毎週の繰り返しの曜日（Google カレンダーのカスタムの繰り返しの曜日の丸と同じ）。
 * 何も選んでいなければ締切の曜日が選ばれている。最後の 1 つは外せない。
 * 締切の曜日だけに戻したら曜日を持たない（前からの「締切の曜日で回る」と同じ）
 */
export function RepeatWeekdays({
  recurrence,
  dueDate,
  onChange,
}: {
  recurrence: Recurrence
  dueDate: string
  onChange: (recurrence: Recurrence) => void
}) {
  const { t } = useTranslation()
  const labels = t('habits.weekdays', { returnObjects: true }) as string[]
  const selected = recurrenceWeekdays(recurrence, dueDate)
  const toggle = (day: number) => {
    const next = selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day].sort((a, b) => a - b)
    if (next.length === 0) return
    const { type, interval } = recurrence
    const onlyDueDay = next.length === 1 && next[0] === isoWeekday(fromDateKey(dueDate))
    onChange(onlyDueDay ? { type, interval } : { type, interval, weekdays: next })
  }
  return (
    <PillToggle
      ariaLabel={t('taskDetail.recurrenceWeekdays')}
      options={WEEK_ORDER.map((d) => ({ value: d, label: labels[d - 1]! }))}
      values={selected}
      onToggle={toggle}
      className="mt-1.5 pl-5"
    />
  )
}
