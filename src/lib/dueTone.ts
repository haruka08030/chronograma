import { addDays } from 'date-fns'
import type { DateTone } from '../components/ui/dueTone'
import { clockOf } from './clockTime'
import { fromDateKey, toDateKey } from './dateKey'
import { zonedNow } from './timeZone'

/**
 * 締切の緊急度。タイムラインの点・To-Do の行・今日の計画で同じ判断にする。
 * - `overdue`: 締切（時刻なしはその日の終わり）が今を過ぎた／見ている日が締切より後／予定の開始（`atTime`）が締切の時刻以降
 * - `today`: 締切が見ている日（`dayKey`）
 * - `tomorrow`: 締切が見ている日の翌日
 */
export function dueToneOf(
  dueDate: string,
  dueTime: string | null,
  dayKey: string,
  opts: { now?: Date; atTime?: string | null } = {},
): DateTone {
  const now = opts.now ?? zonedNow()
  const todayKey = toDateKey(now)
  if (dueDate < todayKey || (dueDate === todayKey && dueTime && dueTime <= clockOf(now))) return 'overdue'
  if (dueDate < dayKey) return 'overdue'
  if (dueDate === dayKey) return dueTime && opts.atTime && opts.atTime >= dueTime ? 'overdue' : 'today'
  if (dueDate === toDateKey(addDays(fromDateKey(dayKey), 1))) return 'tomorrow'
  return 'future'
}
