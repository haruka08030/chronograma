import { isLogTask, type Task } from '../types/task'
import { taskPlacementDate } from './taskTimeRange'
import { zonedNow } from './timeZone'
import { toDateKey } from './dateKey'
import { clockOf } from './clockTime'

/**
 * 予定（時刻つきのタスク）がいまどこにあるか。予定カードと右クリックメニューで同じ判断にする。
 * - `canLogAsPlanned`: 始まった未完了の予定は「予定どおり」記録にして完了できる（今より先の分は記録しない）
 * - `ended`: 終わった予定。記録を始めても意味がないので「記録を始める」は出さない。日をまたぐ予定は終わりの日（`endDate`）で見る
 */
export function planTiming(task: Task, now: Date = zonedNow()): { dateKey: string | null; canLogAsPlanned: boolean; ended: boolean } {
  const dateKey = taskPlacementDate(task)
  const isLog = isLogTask(task)
  const nowHm = clockOf(now)
  const todayKey = toDateKey(now)
  const canLogAsPlanned =
    !isLog &&
    !task.completed &&
    Boolean(dateKey && task.startTime && task.endTime) &&
    (dateKey! < todayKey || (dateKey === todayKey && task.startTime! < nowHm))
  const endKey = task.endDate ?? dateKey
  // 0:00 終わり（23:00–0:00 など）はその日のうちは終わっていない
  const endsAtMidnight = task.endTime === '00:00' && !task.endDate
  const ended =
    Boolean(endKey && task.endTime) &&
    (endKey! < todayKey || (endKey === todayKey && !endsAtMidnight && task.endTime! <= nowHm))
  return { dateKey, canLogAsPlanned, ended }
}
