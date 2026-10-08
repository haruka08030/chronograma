import { useMemo } from 'react'
import type { Task } from '../types/task'
import { useTaskStore } from '../store/taskStore'
import { getDayReviews } from '../lib/weekReview'
import { summarizeSleep, type SleepNight } from '../lib/sleep'
import { computeDayInsights, INSIGHT_DAYS, insightDateKeys, type DayInsight } from '../lib/dayInsights'
import { unplannedListIds } from '../lib/listKind'
import { recordLabelKey } from '../lib/logCategoryColors'
import { fromDateKey } from '../lib/dateKey'
import { useAppTodayKey } from './useAppClock'

/** 日の違いの行（`computeDayInsights`）。睡眠カードが出すかどうかを決めるのにも使う */
export function useDayInsights(): DayInsight[] {
  const tasks = useTaskStore((s) => s.tasks)
  const habits = useTaskStore((s) => s.habits)
  const lists = useTaskStore((s) => s.lists)
  const dayMoods = useTaskStore((s) => s.dayMoods)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const labelPresets = useTaskStore((s) => s.timeLogTagPresets)
  const todayKey = useAppTodayKey()
  const excluded = useMemo(() => unplannedListIds(lists), [lists])
  const labelOf = useMemo(() => (log: Task) => recordLabelKey(log, labelPresets, logCategoryColors), [labelPresets, logCategoryColors])
  // 記録・予定の数字は日ごと（ふりかえりと同じ数え方）。気分が変わっただけでは数え直さない
  const days = useMemo(
    () => getDayReviews(tasks, habits, insightDateKeys(todayKey).map(fromDateKey), excluded, undefined, labelOf),
    [tasks, habits, todayKey, excluded, labelOf],
  )
  const nights = useMemo(() => {
    const keys = insightDateKeys(todayKey)
    const summary = summarizeSleep(tasks, keys[keys.length - 1]!, INSIGHT_DAYS)
    return new Map(summary.nights.filter((n): n is SleepNight => n !== null).map((n) => [n.dateKey, n]))
  }, [tasks, todayKey])
  return useMemo(() => computeDayInsights(days, nights, dayMoods), [days, nights, dayMoods])
}
