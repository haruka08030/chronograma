/**
 * 習慣の時間とその日の結果。中身は Edge Function と同じもの（`supabase/functions/_shared/habitTiming.ts`）。
 * ここでは記録の選び方（記録・睡眠のうちサブタスクでないもの、ゴミ箱・アーカイブは習慣につながったものだけ）と `Task` の型を足す
 */
import { isLogTask, type Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { indexHabitRecords, type HabitRecordIndex as SharedHabitRecordIndex } from '../../supabase/functions/_shared/habitTiming.ts'

export {
  HABIT_ON_TIME_TOLERANCE_MIN,
  habitDayStatus,
  habitMinutesOn,
  habitRecordFor,
  habitRecordsFor,
  habitTimesOn,
  habitUsualTimesOn,
  isTimedHabit,
  plannedRecordTimes,
  type HabitDayStatus,
} from '../../supabase/functions/_shared/habitTiming.ts'

export type HabitRecordIndex = SharedHabitRecordIndex<Task>

export function buildHabitRecordIndex(tasks: readonly Task[]): HabitRecordIndex {
  return indexHabitRecords(
    tasks.filter((t) => isLogTask(t) && !t.parentId),
    isActiveTask,
  )
}
