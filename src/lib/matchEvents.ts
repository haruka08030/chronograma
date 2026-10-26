import type { Task } from '../types/task'
import type { PlannedItem } from '../types/plannedItem'
import { matchPlanAndActual, type MatchedPair as SharedMatchedPair } from '../../supabase/functions/_shared/dayResult.ts'

export type { MatchStatus } from '../../supabase/functions/_shared/dayResult.ts'

export type MatchedPair = SharedMatchedPair<PlannedItem, Task>

/**
 * 予定（Google・習慣・自分で配置した To-Do・予定）とタイムログを突き合わせる。
 * 中身は通知（Edge Function）と同じもの（`supabase/functions/_shared/dayResult.ts`）
 */
export function matchPlanAndActualForDate(planned: PlannedItem[], actualLogs: Task[]): MatchedPair[] {
  return matchPlanAndActual(planned, actualLogs)
}
