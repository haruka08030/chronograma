/**
 * 習慣の達成と記録（純粋な関数。localStorage・i18n を読まない）。
 * 時間を決めた習慣は、達成にすると予定どおりの時刻の記録（完了した時間ログ）を作り、外すとその日の記録をゴミ箱へ入れる
 */
import { buildHabitRecordIndex, habitAsOf, habitRecordFor, habitRecordsFor, isTimedHabit, plannedRecordTimes } from '../lib/habitTiming'
import { logLabelFromTask } from '../lib/logCategoryColors'
import { completedRecordPatch, type CategoryInferenceState } from './taskHelpers'
import type { TaskState } from './storeTypes'

type HabitState = CategoryInferenceState & Pick<TaskState, 'habits'>

/**
 * 未達成なら達成にして、記録が無ければ予定どおりの時刻で作る。変えることが無ければ null。
 * `colorNames` は色の名前（分類の推定に使う。`inferCategoryTags`）
 */
export function completeHabitAsPlannedPatch(
  s: HabitState,
  habitId: string,
  dateKey: string,
  env: { now: string; colorNames: ReadonlySet<string> },
): Pick<TaskState, 'habits'> | Pick<TaskState, 'habits' | 'tasks'> | null {
  const habit = s.habits.find((h) => h.id === habitId)
  if (!habit) return null
  const index = buildHabitRecordIndex(s.tasks)
  const times = plannedRecordTimes(habit, dateKey)
  // その日に同じ名前の記録があれば（タイマーや手入力で記録済み）、それで判定するので新しく作らない
  const needsRecord = times !== null && !habitRecordFor(index, habit, dateKey)
  const alreadyChecked = habit.completedDates.includes(dateKey)
  if (alreadyChecked && !needsRecord) return null
  const habits = alreadyChecked
    ? s.habits
    : s.habits.map((h) => (h.id === habitId ? { ...h, completedDates: [...h.completedDates, dateKey].sort(), updatedAt: env.now } : h))
  if (!needsRecord) return { habits }
  return {
    habits,
    // 習慣の色＝ラベル。タイトルから推定せず、名前の付いた色ならそのラベル、名前の無い色は色のまま記録する
    ...completedRecordPatch(
      s,
      { title: habit.title, dueDate: dateKey, ...times, habitId, label: logLabelFromTask(habit, s.timeLogTagPresets, s.logCategoryColors) },
      env.colorNames,
      env.now,
    ),
  }
}

/**
 * その時間にやった記録（習慣につながった完了した時間ログ）を作る（記録の列に習慣を落とした）。
 * 時間を決めていない習慣はその日を達成にする。時間を決めた習慣はチェックせず記録の時刻で決める
 * （ずれていれば時間外。▶ の記録と同じ）。習慣が無ければ null
 */
export function recordHabitAtPatch(
  s: HabitState,
  habitId: string,
  dateKey: string,
  times: { startTime: string; endTime: string },
  env: { now: string; colorNames: ReadonlySet<string> },
): Pick<TaskState, 'habits' | 'tasks'> | null {
  const habit = s.habits.find((h) => h.id === habitId)
  if (!habit) return null
  const habits =
    isTimedHabit(habitAsOf(habit, dateKey)) || habit.completedDates.includes(dateKey)
      ? s.habits
      : s.habits.map((h) => (h.id === habitId ? { ...h, completedDates: [...h.completedDates, dateKey].sort(), updatedAt: env.now } : h))
  return {
    habits,
    ...completedRecordPatch(
      s,
      { title: habit.title, dueDate: dateKey, ...times, habitId, label: logLabelFromTask(habit, s.timeLogTagPresets, s.logCategoryColors) },
      env.colorNames,
      env.now,
    ),
  }
}

/**
 * 達成を外す。その日の習慣の記録（チェックで作った記録・同じ名前の記録）も一緒にゴミ箱へ入れる。
 * 習慣が無ければ null。`deletedAt` は「元に戻す」で使う削除の時刻（ミリ秒）
 */
export function uncheckHabitDatePatch(
  s: Pick<TaskState, 'habits' | 'tasks' | 'recentDeletes'>,
  habitId: string,
  dateKey: string,
  env: { now: string; deletedAt: number; undoId?: number },
): Pick<TaskState, 'habits' | 'tasks' | 'recentDeletes'> | null {
  const habit = s.habits.find((h) => h.id === habitId)
  if (!habit) return null
  const removeIds = new Set(habitRecordsFor(buildHabitRecordIndex(s.tasks), habit, dateKey).map((t) => t.id))
  const nowIso = env.now
  return {
    habits: s.habits.map((h) =>
      h.id === habitId ? { ...h, completedDates: h.completedDates.filter((d) => d !== dateKey), updatedAt: nowIso } : h,
    ),
    tasks: s.tasks.map((t) => (removeIds.has(t.id) ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t)),
    recentDeletes:
      removeIds.size > 0 ? [...s.recentDeletes, { ids: [...removeIds], at: env.deletedAt, undoId: env.undoId }] : s.recentDeletes,
  }
}
