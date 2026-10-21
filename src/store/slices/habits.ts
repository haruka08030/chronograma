/** 習慣 */
import { addDays } from 'date-fns'
import { isHabitDeleted, type Habit, type HabitTimeOverrides } from '../../types/habit'
import { fromDateKey, toDateKey } from '../../lib/dateKey'
import { newId } from '../../lib/id'
import { buildHabitRecordIndex, habitDayStatus, habitTimesOn, habitUsualTimesOn } from '../../lib/habitTiming'
import { logColorNames } from '../storeDefaults'
import { completeHabitAsPlannedPatch, recordHabitAtPatch, uncheckHabitDatePatch } from '../habitRecord'
import type { TaskState } from '../storeTypes'
import { patchChanges } from '../../lib/sameValue'
import type { SliceContext } from './sliceTypes'

type HabitsActions = Pick<
  TaskState,
  | 'addHabit'
  | 'updateHabit'
  | 'setHabitDayTime'
  | 'clearHabitDayTime'
  | 'setHabitRest'
  | 'deleteHabit'
  | 'restoreDeletedHabits'
  | 'permanentlyDeleteHabits'
  | 'archiveHabit'
  | 'restoreHabit'
  | 'toggleHabitDate'
  | 'completeHabitAsPlanned'
  | 'recordHabitAt'
>

/** 一度に休みにできる日数（期間で選んだとき） */
const HABIT_REST_MAX_DAYS = 366

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
        ...(fields.weekdayTimes ? { weekdayTimes: fields.weekdayTimes } : {}),
        ...(fields.goalMinutes ? { goalMinutes: fields.goalMinutes } : {}),
      }
      set((s) => ({ habits: [...s.habits, habit] }))
      return habit.id
    },
    updateHabit: (id, patch) => {
      // 同じ値なら何もしない（取り消しの履歴を積まない）
      const habit = get().habits.find((h) => h.id === id)
      // patchChanges は undefined の項目を見ないので、曜日ごとの時間・時間の目標を外すのは別に見る
      const drops = (['weekdayTimes', 'goalMinutes'] as const).some((k) => k in patch && !patch[k] && !!habit?.[k])
      if (habit && !patchChanges(habit, patch) && !drops) return
      pushUndo()
      return set((s) => ({
        habits: s.habits.map((h) => {
          if (h.id !== id) return h
          const updated: Habit = { ...h, ...patch, updatedAt: new Date().toISOString() }
          // 曜日ごとの時間を外したら項目ごと外す（同期で「変わった」と見ない形にそろえる）
          if (!updated.weekdayTimes) delete updated.weekdayTimes
          if (!updated.goalMinutes) delete updated.goalMinutes
          return updated
        }),
      }))
    },
    setHabitDayTime: (id, dateKey, startTime, endTime, label) => {
      const habit = get().habits.find((h) => h.id === id)
      if (!habit) return
      // 時間を決めていない習慣は、その日だけ格子に置く（今日の計画の行を予定の列に落とした）
      const current = habitTimesOn(habit, dateKey)
      // 時刻ひとつの習慣も終わりを持たせる（習慣の段から格子に置いた日は枠になる）
      const next = { startTime, endTime }
      if (next.startTime === current?.startTime && next.endTime === current.endTime) return
      // その曜日のいつもの時間に戻したら、その日だけの時間は消す
      const base = habitUsualTimesOn(habit, dateKey)
      const usual = !!base && next.startTime === base.startTime && next.endTime === base.endTime
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
    clearHabitDayTime: (id, dateKey, label) => {
      const habit = get().habits.find((h) => h.id === id)
      if (!habit?.timeOverrides?.[dateKey]) return
      const overrides: HabitTimeOverrides = { ...habit.timeOverrides }
      delete overrides[dateKey]
      pushUndo(label)
      const now = new Date().toISOString()
      set((s) => ({
        habits: s.habits.map((h) => {
          if (h.id !== id) return h
          const updated: Habit = { ...h, timeOverrides: overrides, updatedAt: now }
          if (Object.keys(overrides).length === 0) delete updated.timeOverrides
          return updated
        }),
      }))
    },
    setHabitRest: (id, from, to, rest) => {
      const habit = get().habits.find((h) => h.id === id)
      if (!habit || to < from) return
      const days = new Set<string>()
      for (let d = fromDateKey(from), i = 0; toDateKey(d) <= to && i < HABIT_REST_MAX_DAYS; d = addDays(d, 1), i++) days.add(toDateKey(d))
      const current = habit.restDates ?? []
      const next = rest ? [...new Set([...current, ...days])].sort() : current.filter((d) => !days.has(d))
      if (next.length === current.length && next.every((d, i) => d === current[i])) return
      pushUndo({ key: rest ? 'undo.habitRest' : 'undo.habitRestCleared', params: { name: habit.title } })
      const now = new Date().toISOString()
      set((s) => ({
        habits: s.habits.map((h) => {
          if (h.id !== id) return h
          // 1 日も無くなったら項目ごと外す（同期で「変わった」と見ない形にそろえる）
          const updated: Habit = { ...h, restDates: next, updatedAt: now }
          if (next.length === 0) delete updated.restDates
          return updated
        }),
      }))
    },
    deleteHabit: (id) => {
      // To-Do と同じくゴミ箱へ（達成日は残し、ゴミ箱から戻せる）
      const habit = get().habits.find((h) => h.id === id)
      if (!habit || isHabitDeleted(habit)) return
      pushUndo({ key: 'undo.habitDeleted', params: { name: habit.title } })
      const now = new Date().toISOString()
      set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, deletedAt: now, updatedAt: now } : h)) }))
    },
    restoreDeletedHabits: (ids) => {
      const want = new Set(ids)
      const targets = get().habits.filter((h) => want.has(h.id) && isHabitDeleted(h))
      if (targets.length === 0) return
      pushUndo(targets.length > 1 ? { key: 'undo.habitsRestored', params: { count: targets.length } } : undefined)
      const now = new Date().toISOString()
      const hit = new Set(targets.map((h) => h.id))
      set((s) => ({
        habits: s.habits.map((h) => {
          if (!hit.has(h.id)) return h
          // 戻したら項目ごと外す（同期で「変わった」と見ない形にそろえる）
          const restored: Habit = { ...h, updatedAt: now }
          delete restored.deletedAt
          return restored
        }),
      }))
    },
    permanentlyDeleteHabits: (ids) => {
      const want = new Set(ids)
      if (!get().habits.some((h) => want.has(h.id) && isHabitDeleted(h))) return
      pushUndo()
      set((s) => ({ habits: s.habits.filter((h) => !(want.has(h.id) && isHabitDeleted(h))) }))
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
      const undoId = pushUndo()
      const env = { now: new Date().toISOString(), deletedAt: Date.now(), undoId }
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
    recordHabitAt: (habitId, dateKey, startTime, endTime) => {
      const patch = recordHabitAtPatch(
        get(),
        habitId,
        dateKey,
        { startTime, endTime },
        { now: new Date().toISOString(), colorNames: logColorNames() },
      )
      if (!patch) return
      const record = patch.tasks[patch.tasks.length - 1]
      const name = get().habits.find((h) => h.id === habitId)?.title ?? ''
      pushUndo({ key: record.category ? 'undo.habitRecordedLabel' : 'undo.habitRecorded', params: { name, label: record.category ?? '' } })
      set(patch)
    },
  }
}
