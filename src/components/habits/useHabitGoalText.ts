import { useTranslation } from 'react-i18next'
import { addDays, format } from 'date-fns'
import type { Habit, HabitWeekday } from '../../types/habit'
import { dateFnsLocale } from '../../lib/dateKey'

/** ISO 曜日（1=月）から曜日名を作るための、ある月曜日 */
const ISO_MONDAY = new Date(2024, 0, 1)

/**
 * 習慣の頻度と時刻の 1 行（「毎日 · 07:30」「月・水・金」「週に2回」）。習慣の表の行と詳細で同じにする。
 * 時間の目標があれば最後に「30 分」。曜日ごとに時間を変えた習慣は、同じ時間の曜日をまとめて並べる（「月・水 18:00〜19:00、土 10:00〜11:00」）
 */
export function useHabitGoalText(h: Habit): string {
  const { t, i18n } = useTranslation()
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  const dayNames = (days: HabitWeekday[]) =>
    [...days]
      .sort((a, b) => a - b)
      .map((d) => format(addDays(ISO_MONDAY, d - 1), 'E', { locale: dateLocale }))
      .join(t('habits.weekdaySeparator'))
  const timeText = (start: string | null, end: string | null) =>
    h.timeMode === 'range' && start && end
      ? t('habits.timeRange', { start, end })
      : h.timeMode === 'fixed' && start
        ? t('habits.timeAtValue', { time: start })
        : null
  // 時間の目標（「毎日 · 30 分」）
  const goalTime = h.goalMinutes ? t('habits.goalMinutesValue', { count: h.goalMinutes }) : null
  if (h.frequency.type === 'weekly' && h.weekdayTimes && h.timeMode !== 'none') {
    const groups = new Map<string, HabitWeekday[]>()
    for (const d of [...h.frequency.weekdays].sort((a, b) => a - b)) {
      const w = h.weekdayTimes[d]
      const time = timeText(w?.startTime ?? h.startTime, w ? w.endTime : h.endTime) ?? ''
      groups.set(time, [...(groups.get(time) ?? []), d])
    }
    const grouped = [...groups].map(([time, days]) => [dayNames(days), time].filter(Boolean).join(' ')).join(t('habits.timeGroupSeparator'))
    return [grouped, goalTime].filter(Boolean).join(' · ')
  }
  // 曜日を指定した習慣は「週に3日」だと回数で数える習慣に読めるので、決めた曜日をそのまま出す（月・水・金）
  const goal =
    h.frequency.type === 'daily'
      ? t('habits.goalDaily')
      : h.frequency.type === 'timesPerWeek'
        ? t('habits.goalTimesPerWeek', { count: h.frequency.count })
        : dayNames(h.frequency.weekdays)
  return [goal, timeText(h.startTime, h.endTime), goalTime].filter(Boolean).join(' · ')
}
