import { useTaskStore } from '../store/taskStore'
import { normalizeWeekStart, type WeekStartDay } from '../lib/weekStart'

/** 設定の週の開始日（0 = 日曜、1 = 月曜、6 = 土曜）。変えたら描き直す。中身は lib/weekStart.ts */
export function useWeekStartsOn(): WeekStartDay {
  return useTaskStore((s) => normalizeWeekStart(s.weekStartsOn))
}
