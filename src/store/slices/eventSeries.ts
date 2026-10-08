/** 毎週の予定（授業など、#279）の繰り返しの付け替え・範囲を選んだ削除と、時間割の設定・マスからの授業の出し入れ */
import { changeSeriesRule, defaultSeriesUntil, occurrenceFrom, seriesDates, seriesScopeIds, sharedSeriesPatch } from '../../lib/eventSeries'
import { classStartDate, normalizeTimetable } from '../../lib/timetable'
import { newId } from '../../lib/id'
import { sameValue } from '../../lib/sameValue'
import { appTodayKey } from '../../lib/timeZone'
import type { EventSeries } from '../../types/task'
import { INBOX_ID } from '../storeConstants'
import { applyTaskPatch, makeTask, orderForNewSiblingAtFront, patchChangesTask } from '../taskHelpers'
import type { TaskState } from '../storeTypes'
import type { SliceContext } from './sliceTypes'

type EventSeriesActions = Pick<
  TaskState,
  'setEventRepeat' | 'setSeriesEditScope' | 'deleteEventSeries' | 'saveTimetable' | 'addTimetableClass' | 'updateTimetableClass'
>

export function createEventSeriesSlice({ set, get, undo }: SliceContext): EventSeriesActions {
  const { pushUndo } = undo
  return {
    setEventRepeat: (taskId, rule) => {
      const next = changeSeriesRule(get().tasks, taskId, rule, new Date().toISOString(), newId)
      if (!next) return false
      pushUndo()
      set({ tasks: next })
      return true
    },

    setSeriesEditScope: (taskId, scope) => {
      const cur = get().seriesEditScope
      if (scope === null) {
        if (cur?.taskId === taskId) set({ seriesEditScope: null })
        return
      }
      if (cur?.taskId === taskId && cur.scope === scope) return
      set({ seriesEditScope: { taskId, scope } })
    },

    deleteEventSeries: (taskId, scope) => {
      const s0 = get()
      const task = s0.tasks.find((t) => t.id === taskId)
      if (!task) return 0
      const ids = seriesScopeIds(s0.tasks, task, scope)
      const targets = s0.tasks.filter((t) => ids.has(t.id) && !t.deletedAt)
      if (targets.length === 0) return 0
      pushUndo(targets.length > 1 ? { key: 'undo.eventsDeleted', params: { title: task.title, count: targets.length } } : undefined)
      const nowIso = new Date().toISOString()
      set((s) => ({
        tasks: s.tasks.map((t) => (ids.has(t.id) && !t.deletedAt ? { ...t, deletedAt: nowIso, updatedAt: nowIso } : t)),
        recentDeletes: [...s.recentDeletes, { ids: targets.map((t) => t.id), at: Date.now() }],
      }))
      return targets.length
    },

    saveTimetable: (timetable) => {
      const next = normalizeTimetable(timetable)
      // 同じ中身なら時刻を付けない（同期で送り直さない）
      if (sameValue(next, get().timetable)) return
      set({ timetable: next })
    },

    addTimetableClass: ({ weekday, startTime, endTime, title, color }) => {
      const s = get()
      const tt = s.timetable
      const from = classStartDate(tt, appTodayKey())
      const until = tt.termEnd ?? defaultSeriesUntil(from)
      const series: EventSeries = { id: newId(), weekdays: [weekday], until, skipHolidays: tt.skipHolidays }
      const dates = seriesDates(from, series)
      const name = title.trim()
      if (dates.length === 0 || !name) return 0
      const now = new Date().toISOString()
      // ふつうの予定と同じ（未分類に入る。予定のあとの確認・記録・統計・通知も同じ）
      const first = {
        ...makeTask(
          { title: name, listId: INBOX_ID, scheduledDate: dates[0]!, startTime, endTime, kind: 'event', color },
          orderForNewSiblingAtFront(s.tasks, INBOX_ID, null),
          now,
        ),
        series,
      }
      const rows = [first, ...dates.slice(1).map((d) => occurrenceFrom(first, d, series, newId(), now))]
      pushUndo({ key: 'undo.classAdded', params: { title: name, count: rows.length } })
      set((st) => ({ tasks: [...st.tasks, ...rows] }))
      return rows.length
    },

    updateTimetableClass: (firstTaskId, patch) => {
      const s = get()
      const task = s.tasks.find((t) => t.id === firstTaskId)
      if (!task) return
      const clean = sharedSeriesPatch({
        ...(patch.title !== undefined && patch.title.trim() ? { title: patch.title.trim() } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
      })
      const ids = seriesScopeIds(s.tasks, task, 'following')
      if (!s.tasks.some((t) => ids.has(t.id) && patchChangesTask(t, clean))) return
      pushUndo()
      const now = new Date().toISOString()
      set((st) => ({ tasks: st.tasks.map((t) => (ids.has(t.id) ? applyTaskPatch(t, clean, now) : t)) }))
    },
  }
}
