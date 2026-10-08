/** 習慣 */
import type { Habit, HabitTimeOverrides } from '../../types/habit'
import { newId } from '../../lib/id'
import { buildHabitRecordIndex, habitDayStatus, habitTimesOn } from '../../lib/habitTiming'
import { logColorNames } from '../storeDefaults'
import { completeHabitAsPlannedPatch, uncheckHabitDatePatch } from '../habitRecord'
import type { TaskState } from '../storeTypes'
import { patchChanges } from '../../lib/sameValue'
import type { SliceContext } from './sliceTypes'

type HabitsActions = Pick<
  TaskState,
  | 'addHabit'
  | 'updateHabit'
  | 'setHabitDayTime'
  | 'deleteHabit'
  | 'archiveHabit'
  | 'restoreHabit'
  | 'toggleHabitDate'
  | 'completeHabitAsPlanned'
>

export function createHabitsSlice({ set, get, undo }: SliceContext): HabitsActions {
  const { pushUndo } = undo
  return {
    addHabit: (fields) => {
      pushUndo()
      const now = new Date().toISOString()
      const habit: Habit = {
        id: newId(),
        title: fields.title,
        color: fields.color,
        timeMode: fields.timeMode,
        startTime: fields.startTime,
        endTime: fields.endTime,
        frequency: fields.frequency,
        createdAt: now,
        updatedAt: now,
        completedDates: [],
        archivedAt: null,
      }
      set((s) => ({ habits: [...s.habits, habit] }))
      return habit.id
    },
    updateHabit: (id, patch) => {
      // 同じ値なら何もしない（取り消しの履歴を積まない）
      const habit = get().habits.find((h) => h.id === id)
      if (habit && !patchChanges(habit, patch)) return
      pushUndo()
      return set((s) => ({
        habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch, updatedAt: new Date().toISOString() } : h)),
      }))
    },
    setHabitDayTime: (id, dateKey, startTime, endTime, label) => {
      const habit = get().habits.find((h) => h.id === id)
      const current = habit ? habitTimesOn(habit, dateKey) : null
      if (!habit || !current) return
      const next = { startTime, endTime: current.endTime === null ? null : endTime }
      if (next.startTime === current.startTime && next.endTime === current.endTime) return
      // 習慣の時間に戻したら、その日だけの時間は消す
      const usual = next.startTime === habit.startTime && (next.endTime === null || next.endTime === habit.endTime)
      const overrides: HabitTimeOverrides = { ...habit.timeOverrides }
      if (usual) delete overrides[dateKey]
      else overrides[dateKey] = next
      pushUndo(label)
      const now = new Date().toISOString()
      set((s) => ({
        habits: s.habits.map((h) => {
          if (h.id !== id) return h
          // 1 日も無くなったら項目ごと外す（同期で「変わった」と見ない形にそろえる）
          const updated: Habit = { ...h, timeOverrides: overrides, updatedAt: now }
          if (Object.keys(overrides).length === 0) delete updated.timeOverrides
          return updated
        }),
      }))
    },
    deleteHabit: (id) => {
      const name = get().habits.find((h) => h.id === id)?.title ?? ''
      pushUndo({ key: 'undo.habitDeleted', params: { name } })
      return set((s) => ({ habits: s.habits.filter((h) => h.id !== id) }))
    },
    archiveHabit: (id) => {
      const habit = get().habits.find((h) => h.id === id)
      if (!habit || habit.archivedAt) return
      pushUndo({ key: 'undo.habitArchived', params: { name: habit.title } })
      const now = new Date().toISOString()
      set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, archivedAt: now, updatedAt: now } : h)) }))
    },
    restoreHabit: (id) => {
      if (!get().habits.find((h) => h.id === id)?.archivedAt) return
      pushUndo()
      const now = new Date().toISOString()
      set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, archivedAt: null, updatedAt: now } : h)) }))
    },
    toggleHabitDate: (habitId, dateKey) => {
      const s0 = get()
      const habit = s0.habits.find((h) => h.id === habitId)
      if (!habit) return
      if (habitDayStatus(habit, dateKey, buildHabitRecordIndex(s0.tasks)) === 'missed') {
        get().completeHabitAsPlanned(habitId, dateKey)
        return
      }
      // その日の習慣の記録（チェックで作った記録・同じ名前の記録）も一緒に外す。ゴミ箱から戻せる
      pushUndo()
      const env = { now: new Date().toISOString(), deletedAt: Date.now() }
      set((s) => uncheckHabitDatePatch(s, habitId, dateKey, env) ?? s)
    },
    completeHabitAsPlanned: (habitId, dateKey) => {
      // 時間を決めた習慣は、予定どおりの時刻の記録も作る（`habitRecord.ts`）
      const patch = completeHabitAsPlannedPatch(get(), habitId, dateKey, { now: new Date().toISOString(), colorNames: logColorNames() })
      if (!patch) return
      // 記録を作ったときは、どのラベルで残したかを出す（習慣の色＝ラベルなので、黙って付くと気付けない）
      const record = 'tasks' in patch ? patch.tasks[patch.tasks.length - 1] : undefined
      const name = get().habits.find((h) => h.id === habitId)?.title ?? ''
      pushUndo(
        record
          ? {
              key: record.category ? 'undo.habitRecordedLabel' : 'undo.habitRecorded',
              params: { name, label: record.category ?? '' },
            }
          : undefined,
      )
      set(patch)
    },
  }
}
