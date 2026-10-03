/** 習慣 */
import type { Habit } from '../../types/habit'
import i18n from '../../i18n/config'
import { newId } from '../../lib/id'
import { buildHabitRecordIndex, habitDayStatus } from '../../lib/habitTiming'
import { logColorNames } from '../storeDefaults'
import { completeHabitAsPlannedPatch, uncheckHabitDatePatch } from '../habitRecord'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type HabitsActions = Pick<
  TaskState,
  | 'addHabit'
  | 'updateHabit'
  | 'deleteHabit'
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
      }
      set((s) => ({ habits: [...s.habits, habit] }))
    },
    updateHabit: (id, patch) => {
      pushUndo()
      return set((s) => ({
        habits: s.habits.map((h) =>
          h.id === id ? { ...h, ...patch, updatedAt: new Date().toISOString() } : h,
        ),
      }))
    },
    deleteHabit: (id) => {
      const name = get().habits.find((h) => h.id === id)?.title ?? ''
      pushUndo(i18n.t('undo.habitDeleted', { name }))
      return set((s) => ({ habits: s.habits.filter((h) => h.id !== id) }))
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
      pushUndo()
      set(patch)
    },
  }
}
