/** 習慣 */
import { addDays } from 'date-fns'
import { isHabitDeleted, type Habit, type HabitTimeOverride, type HabitTimeOverrides, type HabitWeekday } from '../../types/habit'
import { fromDateKey, toDateKey } from '../../lib/dateKey'
import { newId } from '../../lib/id'
import { buildHabitRecordIndex, habitDayStatus, habitTimesOn, habitUsualTimesOn, isoWeekdayOf } from '../../lib/habitTiming'
import { logColorNames } from '../storeDefaults'
import { completeHabitAsPlannedPatch, recordHabitAtPatch, uncheckHabitDatePatch } from '../habitRecord'
import type { TaskState } from '../storeTypes'
import { patchChanges } from '../../lib/sameValue'
import { createdPastRules, pastRulesAfterEdit } from '../../lib/habitPastRules'
import { appTodayKey, zonedNow } from '../../lib/timeZone'
import { planSleepMove, withWakeDate } from '../../lib/sleepFromHabit'
import type { Task } from '../../types/task'
import { normalizeSleepSchedule } from '../../lib/sleepSchedule'
import { minutesOfDay } from '../../lib/clockTime'
import type { SliceContext } from './sliceTypes'

type HabitsActions = Pick<
  TaskState,
  | 'addHabit'
  | 'updateHabit'
  | 'setHabitDayTime'
  | 'setHabitTime'
  | 'clearHabitDayTime'
  | 'setHabitRest'
  | 'deleteHabit'
  | 'restoreDeletedHabits'
  | 'permanentlyDeleteHabits'
  | 'archiveHabit'
  | 'moveHabitToSleep'
  | 'restoreHabit'
  | 'toggleHabitDate'
  | 'completeHabitAsPlanned'
  | 'recordHabitAt'
>

/** 一度に休みにできる日数（期間で選んだとき） */
const HABIT_REST_MAX_DAYS = 366

/** 期限まで同じ曜日の時間を変えるとき、日ごとの時間を入れる回数の上限（約 1 年） */
const HABIT_WEEKDAY_TIME_MAX_WEEKS = 53

const sameTimes = (a: HabitTimeOverride | null, b: HabitTimeOverride | null) =>
  !!a && !!b && a.startTime === b.startTime && a.endTime === b.endTime

/** その日だけの時間を `times` にする（いつもの時間と同じなら消す） */
function putDayTime(habit: Habit, overrides: HabitTimeOverrides, dateKey: string, times: HabitTimeOverride) {
  if (sameTimes(habitUsualTimesOn(habit, dateKey), times)) delete overrides[dateKey]
  else overrides[dateKey] = times
}

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
        ...(fields.kind ? { kind: fields.kind } : {}),
        // 作った日より前の日は変えない（予定の日にしない）
        pastRules: createdPastRules(appTodayKey()),
      }
      set((s) => ({ habits: [...s.habits, habit] }))
      return habit.id
    },
    updateHabit: (id, patch) => {
      // 同じ値なら何もしない（取り消しの履歴を積まない）
      const habit = get().habits.find((h) => h.id === id)
      // patchChanges は undefined の項目を見ないので、曜日ごとの時間・時間の目標・ルーティンを外すのは別に見る
      const drops = (['weekdayTimes', 'goalMinutes', 'kind'] as const).some((k) => k in patch && !patch[k] && !!habit?.[k])
      if (habit && !patchChanges(habit, patch) && !drops) return
      pushUndo()
      return set((s) => ({
        habits: s.habits.map((h) => {
          if (h.id !== id) return h
          const updated: Habit = { ...h, ...patch, updatedAt: new Date().toISOString() }
          // 曜日ごとの時間を外したら項目ごと外す（同期で「変わった」と見ない形にそろえる）
          if (!updated.weekdayTimes) delete updated.weekdayTimes
          if (!updated.goalMinutes) delete updated.goalMinutes
          if (!updated.kind) delete updated.kind
          // 頻度・時間を変えても、今日より前の日は前の設定のまま数える
          const pastRules = pastRulesAfterEdit(h, updated, appTodayKey())
          if (pastRules) updated.pastRules = pastRules
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
    setHabitTime: (id, dateKey, times, scope) => {
      const habit = get().habits.find((h) => h.id === id)
      if (!habit) return
      const overrides: HabitTimeOverrides = { ...habit.timeOverrides }
      let next: Habit = habit
      if (scope.kind === 'day') {
        putDayTime(habit, overrides, dateKey, times)
      } else if (scope.until) {
        // 期限まで: その曜日の日ごとの時間を入れる（期限の後はいつもの時間）
        for (let d = fromDateKey(dateKey), i = 0; toDateKey(d) <= scope.until && i < HABIT_WEEKDAY_TIME_MAX_WEEKS; d = addDays(d, 7), i++) {
          putDayTime(habit, overrides, toDateKey(d), times)
        }
      } else {
        // ずっと: 曜日ごとの時間を変える。今日〜その日の前の同じ曜日は前の時間のまま、その日から先の同じ曜日の日ごとの時間は外す
        const today = appTodayKey()
        const weekday = isoWeekdayOf(dateKey) as HabitWeekday
        const from = dateKey > today ? dateKey : today
        for (let d = fromDateKey(today); toDateKey(d) < dateKey; d = addDays(d, 1)) {
          const key = toDateKey(d)
          if (isoWeekdayOf(key) === weekday && !overrides[key]) {
            const before = habitUsualTimesOn(habit, key)
            if (before && !sameTimes(before, times)) overrides[key] = before
          }
        }
        for (const key of Object.keys(overrides)) if (key >= from && isoWeekdayOf(key) === weekday) delete overrides[key]
        next = { ...habit, weekdayTimes: { ...habit.weekdayTimes, [weekday]: times } }
        // 前の日は前の設定のまま数える
        const pastRules = pastRulesAfterEdit(habit, next, today)
        if (pastRules) next.pastRules = pastRules
      }
      const changed =
        next !== habit ||
        Object.keys(overrides).length !== Object.keys(habit.timeOverrides ?? {}).length ||
        Object.entries(overrides).some(([k, v]) => !sameTimes(habit.timeOverrides?.[k] ?? null, v))
      if (!changed) return
      pushUndo()
      const now = new Date().toISOString()
      set((s) => ({
        habits: s.habits.map((h) => {
          if (h.id !== id) return h
          // 1 日も無くなったら項目ごと外す（同期で「変わった」と見ない形にそろえる）
          const updated: Habit = { ...next, timeOverrides: overrides, updatedAt: now }
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
      const endedOn = habit.endedOn ?? appTodayKey()
      set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, deletedAt: now, endedOn, updatedAt: now } : h)) }))
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
          if (!restored.archivedAt) delete restored.endedOn
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
      // その日から先だけ外す（前の日の予定・達成率は残す）
      const endedOn = habit.endedOn ?? appTodayKey()
      set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, archivedAt: now, endedOn, updatedAt: now } : h)) }))
    },
    moveHabitToSleep: (id) => {
      const s0 = get()
      const habit = s0.habits.find((h) => h.id === id)
      if (!habit || habit.archivedAt) return
      const todayKey = appTodayKey()
      const move = planSleepMove(habit, s0.tasks, todayKey)
      const convert = new Set(move.convertIds)
      const trash = new Set(move.trashIds)
      // 1 回の ⌘Z で全部戻す（睡眠の予定・記録・習慣のアーカイブ）
      pushUndo({ key: 'undo.habitMovedToSleep', params: { name: habit.title } })
      const now = new Date().toISOString()
      set((s) => ({
        // 前から睡眠の予定のある曜日はそのまま（習慣の分は空いている曜日にだけ入れる）
        addons: { ...s.addons, sleepSchedule: normalizeSleepSchedule({ ...move.schedule, ...(s.addons.sleepSchedule ?? {}) }) },
        tasks: s.tasks.map((t) => {
          if (convert.has(t.id)) return { ...withWakeDate(t), kind: 'sleep', habitId: null, updatedAt: now } as Task
          if (trash.has(t.id)) return { ...t, deletedAt: now, updatedAt: now }
          return t
        }),
        habits: s.habits.map((h) => (h.id === id ? { ...h, archivedAt: now, endedOn: h.endedOn ?? todayKey, updatedAt: now } : h)),
      }))
    },
    restoreHabit: (id) => {
      if (!get().habits.find((h) => h.id === id)?.archivedAt) return
      pushUndo()
      const now = new Date().toISOString()
      set((s) => ({
        habits: s.habits.map((h) => {
          if (h.id !== id) return h
          const restored: Habit = { ...h, archivedAt: null, updatedAt: now }
          if (!restored.deletedAt) delete restored.endedOn
          return restored
        }),
      }))
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
      const patch = completeHabitAsPlannedPatch(get(), habitId, dateKey, {
        now: new Date().toISOString(),
        colorNames: logColorNames(),
        limitMin: recordLimitOn(dateKey),
      })
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

/** 記録を置ける最後の分（今日は今、過ぎた日は無し、先の日は 0。タイムラインの `logLimitAt` と同じ） */
function recordLimitOn(dateKey: string): number | null {
  const now = zonedNow()
  const today = toDateKey(now)
  return dateKey < today ? null : dateKey > today ? 0 : minutesOfDay(now)
}
