import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { appTimeZone } from '../../lib/timeZone'
import { convertTaskTimes, foreignTimeZone, timesPatchFromZone } from '../../lib/taskTimeZone'

export type TaskTimesPatch = Partial<Pick<Task, 'dueDate' | 'dueTime' | 'scheduledDate' | 'startTime' | 'endTime' | 'endDate'>>

/**
 * タスク詳細の日付・時刻。タイムゾーンを決めたタスクは、日付・時刻をそのタイムゾーンで見せて編集する（列はアプリのタイムゾーン）。
 * - `tv`: 見せる値、`updateTimes`: 見せている値での変更を列に書き戻す
 * - タイムゾーンは時刻の行の末尾に置く（予定の時刻があれば予定の行、なければ締切の行、どちらも無ければ単独の行）
 */
export function useTaskTimes(task: Task) {
  const updateTask = useTaskStore((s) => s.updateTask)
  // アプリのタイムゾーンが変わったら見せる値を作り直す
  useTaskStore((s) => s.appTimeZone)
  const zone = foreignTimeZone(task)
  const tv = zone ? convertTaskTimes(task, appTimeZone(), zone) : task
  const showTimeZone = !!(task.startTime || task.dueTime || zone)
  const tzOnScheduled = showTimeZone && !!tv.scheduledDate && (!!task.startTime || !task.dueTime)
  const tzOnDeadline = showTimeZone && !tzOnScheduled && !!tv.dueDate
  const tzLoose = showTimeZone && !tzOnScheduled && !tzOnDeadline
  const updateTimes = (patch: TaskTimesPatch) => updateTask(task.id, zone ? timesPatchFromZone(tv, patch, zone) : patch)
  return { zone, tv, updateTimes, tzOnScheduled, tzOnDeadline, tzLoose }
}
