import { useTranslation } from 'react-i18next'
import { addDays, format } from 'date-fns'
import type { Habit } from '../../types/habit'
import { dateFnsLocale } from '../../lib/dateKey'

/** ISO 曜日（1=月）から曜日名を作るための、ある月曜日 */
const ISO_MONDAY = new Date(2024, 0, 1)

/** 習慣の頻度と時刻の 1 行（「毎日 · 07:30」「月・水・金」「週に2回」）。習慣の表の行と詳細で同じにする */
export function useHabitGoalText(h: Habit): string {
  const { t, i18n } = useTranslation()
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  // 曜日を指定した習慣は「週に3日」だと回数で数える習慣に読めるので、決めた曜日をそのまま出す（月・水・金）
  const goal =
    h.frequency.type === 'daily'
      ? t('habits.goalDaily')
      : h.frequency.type === 'timesPerWeek'
        ? t('habits.goalTimesPerWeek', { count: h.frequency.count })
        : [...h.frequency.weekdays]
            .sort((a, b) => a - b)
            .map((d) => format(addDays(ISO_MONDAY, d - 1), 'E', { locale: dateLocale }))
            .join(t('habits.weekdaySeparator'))
  const time =
    h.timeMode === 'range' && h.startTime && h.endTime
      ? t('habits.timeRange', { start: h.startTime, end: h.endTime })
      : h.timeMode === 'fixed' && h.startTime
        ? t('habits.timeAtValue', { time: h.startTime })
        : null
  return [goal, time].filter(Boolean).join(' · ')
}
