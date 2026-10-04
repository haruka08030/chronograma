import type { TFunction } from 'i18next'
import type { Recurrence } from '../types/task'
import { recurrenceWeekdays } from './recurrence'

const WORKDAYS = '1,2,3,4,5'

/**
 * 繰り返しの説明（「毎週 月・水」「2週ごと 金」「平日」「毎月」）。
 * 曜日の名前と区切りは習慣の曜日と同じ（`habits.weekdays` / `habits.weekdaySeparator`）
 */
export function recurrenceLabel(t: TFunction, recurrence: Recurrence, dueDate: string | null): string {
  const { type, interval } = recurrence
  const repeat =
    interval === 1
      ? t(`taskDetail.recurrenceIntervals.${type}`)
      : t(`taskDetail.recurrenceSummary.${type}`, { count: interval })
  const days = recurrenceWeekdays(recurrence, dueDate)
  if (days.length === 0) return repeat
  if (interval === 1 && days.join(',') === WORKDAYS) return t('taskDetail.recurrenceSummary.everyWorkday')
  const names = t('habits.weekdays', { returnObjects: true }) as string[]
  return t('taskDetail.recurrenceSummary.withDays', {
    repeat,
    days: days.map((d) => names[d - 1]).join(t('habits.weekdaySeparator')),
  })
}
