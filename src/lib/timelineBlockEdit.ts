import { addMinutes } from 'date-fns'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { isLogTask, type Task } from '../types/task'
import type { CalendarEvent } from '../types/calendarEvent'
import { parseHabitSlotId, habitToPlannedItem } from './habitSlots'
import { buildHabitRecordIndex, habitDayStatus } from './habitTiming'
import { canEditGoogleEvent, moveGoogleEvent } from './googleEventEdit'
import { googleEventTiming, movedGoogleEventTiming } from './googleCalendar'
import { googleEventCrossesDay } from './googleEventSpan'
import { SNAP_MINUTES, timeToMinutes } from './timeGrid'
import { minutesToTime } from './clockTime'
import { toDateKey } from './dateKey'
import { shortDate } from './moveToast'
import { zonedNow } from './timeZone'
import {
  isOvernightTimeLog,
  logPatchForInterval,
  patchAfterLogResize,
  patchAfterTimelineMove,
  taskPlacementDate,
  taskTimedInterval,
} from './taskTimeRange'
import { announce } from './announce'

/**
 * タイムラインのブロック（予定・記録・習慣の枠・Google の予定）の時刻を変える処理。
 * マウスのドラッグ（`WeekCalendarView`）とキー（Alt+↑↓・Alt+Shift+↑↓）が同じ道を通る。
 * どちらも元に戻せる（Google の予定はドラッグと同じく Google へ送るだけ）
 */

/** その日の記録に使える最後の分（null は制限なし＝過去の日）。記録は今より先には作れない */
export type LogLimit = (dateKey: string) => number | null

export function logLimitAt(now: Date): LogLimit {
  const todayKey = toDateKey(now)
  return (key) => (key < todayKey ? null : key > todayKey ? 0 : now.getHours() * 60 + now.getMinutes())
}

export type BlockEditContext = {
  logLimit: LogLimit
  /** 動かしている Google の予定（ドラッグはつかんだ時点のもの。週をめくって一覧から消えても動かせるように） */
  googleEvent?: CalendarEvent | null
}

/** 習慣の枠を動かした・伸ばした: その日だけの時間にする */
function setHabitDayTimeFromSlot(slot: { habitId: string; dateKey: string }, startTime: string, endTime: string) {
  const { habits, setHabitDayTime } = useTaskStore.getState()
  const habit = habits.find((h) => h.id === slot.habitId)
  if (!habit) return
  const time = habit.timeMode === 'range' ? `${startTime}–${endTime}` : startTime
  setHabitDayTime(habit.id, slot.dateKey, startTime, endTime, {
    key: 'undo.habitDayTime',
    params: { name: habit.title, date: shortDate(slot.dateKey), time },
  })
}

/** ブロックを `dateKey` の `startTime` へ動かす（長さは保つ）。動かしたら true */
export function applyBlockMove(taskId: string, dateKey: string, startTime: string, endTime: string, ctx: BlockEditContext): boolean {
  const habitSlot = parseHabitSlotId(taskId)
  if (habitSlot) {
    // 習慣の枠はその日の中だけ動かせる（ほかの日へ持っていったら元に戻す）
    if (dateKey !== habitSlot.dateKey) return false
    setHabitDayTimeFromSlot(habitSlot, startTime, endTime)
    return true
  }
  if (taskId.startsWith('event-')) {
    const ev = ctx.googleEvent
    // 元の枠に戻しただけなら Google へ書き込まない。動かすときは長さ（日をまたぐ予定は終わりの日も）を保つ
    if (!ev || (ev.date === dateKey && ev.startTime === startTime)) return false
    void moveGoogleEvent(ev, movedGoogleEventTiming(ev, dateKey, startTime))
    return true
  }
  const { tasks, updateTask } = useTaskStore.getState()
  const prev = tasks.find((x) => x.id === taskId)
  if (!prev) return false
  const patch = patchAfterTimelineMove(prev, dateKey, startTime, endTime)
  if (isLogTask(prev)) {
    // 記録を今より先へは動かせない（元の位置に戻る）
    const limit = ctx.logLimit(dateKey)
    const crossesDay = isOvernightTimeLog({ ...prev, ...patch } as Task)
    if (limit !== null && (crossesDay || timeToMinutes(endTime) > limit)) return false
  }
  updateTask(taskId, patch, {
    key: 'undo.blockMoved',
    params: { title: prev.title, date: shortDate(dateKey), time: `${startTime}–${endTime}` },
  })
  return true
}

/** ブロックの長さを変える。`dateKey` は引いた列の日（日をまたぐ記録は、その日の区間の時刻）。変えたら true */
export function applyBlockResize(taskId: string, startTime: string, endTime: string, dateKey: string, ctx: BlockEditContext): boolean {
  const habitSlot = parseHabitSlotId(taskId)
  if (habitSlot) {
    setHabitDayTimeFromSlot(habitSlot, startTime, endTime)
    return true
  }
  if (taskId.startsWith('event-')) {
    const ev = ctx.googleEvent
    if (!ev || (ev.startTime === startTime && ev.endTime === endTime)) return false
    // 上の端（開始）だけ変えたときは終わりの日を保つ（日をまたぐ予定が 1 日に縮まないように）
    const endDate = ev.endTime === endTime ? googleEventTiming(ev).endDate : null
    void moveGoogleEvent(ev, { date: ev.date, endDate, startTime, endTime })
    return true
  }
  const { tasks, updateTask } = useTaskStore.getState()
  const prev = tasks.find((x) => x.id === taskId)
  if (!prev) return false
  // 日をまたぐ記録: 引いた列の日付と時刻で開始・終了を決める（記録全体の時刻だけ書き換えると 1 日ぶん長くなっていた）
  if (isLogTask(prev) && isOvernightTimeLog(prev)) {
    const patch = patchAfterLogResize(prev, dateKey, startTime, endTime)
    if (!patch) return false
    // 今より先の記録にはしない
    const next = taskTimedInterval({ ...prev, ...patch } as Task)
    if (!next || next.end > zonedNow()) return false
    updateTask(taskId, patch, {
      key: 'undo.blockResized',
      params: { title: prev.title, time: `${patch.startTime}–${patch.endTime}` },
    })
    return true
  }
  if (isLogTask(prev) && prev.dueDate && !prev.endDate) {
    const limit = ctx.logLimit(prev.dueDate)
    if (limit !== null && timeToMinutes(endTime) > limit) {
      if (timeToMinutes(startTime) >= limit) return false
      endTime = minutesToTime(limit)
    }
  }
  updateTask(taskId, { startTime, endTime }, { key: 'undo.blockResized', params: { title: prev.title, time: `${startTime}–${endTime}` } })
  return true
}

/** キーで動かす・伸ばすときの刻み（グリッドのスナップと同じ 15 分） */
export const NUDGE_MINUTES = SNAP_MINUTES

/** move: 全体を前後へ / resize: 終わりだけ伸び縮み */
export type NudgeMode = 'move' | 'resize'

const DAY_MINUTES = 24 * 60

/**
 * 1 日の中の枠（予定・習慣・Google の予定）を 15 分ずらした時刻。日の外へ出る・15 分より短くなるなら null。
 * 刻みはずらす量だけで、10:07 は 10:22 になる（記録や予定の分を勝手に丸めない）。
 * 終わりの書き方はドラッグと同じ（動かすと 0:00、伸ばすと 24:00）
 */
export function nudgedDayRange(
  startTime: string,
  endTime: string,
  mode: NudgeMode,
  dir: -1 | 1,
): { startTime: string; endTime: string } | null {
  const s = timeToMinutes(startTime)
  let e = timeToMinutes(endTime)
  if (e <= s) e += DAY_MINUTES
  const d = dir * NUDGE_MINUTES
  if (mode === 'move') {
    if (s + d < 0 || e + d > DAY_MINUTES) return null
    return { startTime: minutesToTime(s + d), endTime: minutesToTime((e + d) % DAY_MINUTES) }
  }
  if (e + d - s < NUDGE_MINUTES || e + d > DAY_MINUTES) return null
  return { startTime, endTime: minutesToTime(e + d) }
}

export type NudgeResult = { title: string; startTime: string; endTime: string }

/**
 * ブロックをキーで 15 分ずらす（Alt+↑↓）・終わりを 15 分伸び縮みする（Alt+Shift+↑↓）。
 * ドラッグと同じ決まり: 記録は今より先にしない（伸ばすときは今で止める）、日をまたぐ記録は日付ごと動く、
 * 済んだ習慣の枠・書き換えられない Google の予定・日をまたぐ Google の予定は動かさない。変えたら新しい時刻
 */
export function nudgeTimelineBlock(id: string, mode: NudgeMode, dir: -1 | 1, now: Date = zonedNow()): NudgeResult | null {
  const state = useTaskStore.getState()
  const ctx: BlockEditContext = { logLimit: logLimitAt(now) }

  const habitSlot = parseHabitSlotId(id)
  if (habitSlot) {
    const habit = state.habits.find((h) => h.id === habitSlot.habitId)
    if (!habit) return null
    const index = buildHabitRecordIndex(state.tasks)
    // 済んだ枠は記録のほうを動かす（ドラッグと同じ）
    if (habitDayStatus(habit, habitSlot.dateKey, index) !== 'missed') return null
    const slot = habitToPlannedItem(habit, habitSlot.dateKey, index)
    const next = slot && nudgedDayRange(slot.startTime, slot.endTime, mode, dir)
    if (!next) return null
    const ok =
      mode === 'move'
        ? applyBlockMove(id, habitSlot.dateKey, next.startTime, next.endTime, ctx)
        : applyBlockResize(id, next.startTime, next.endTime, habitSlot.dateKey, ctx)
    return ok ? { title: habit.title, ...next } : null
  }

  if (id.startsWith('event-')) {
    const ev = state.calendarEvents.find((e) => e.id === id.slice('event-'.length))
    if (!ev || ev.isAllDay || !ev.startTime || !ev.endTime) return null
    // 日をまたぐ予定は列ごとに区間しか描いていないので、ドラッグと同じく動かさない（カードの時刻から直す）
    if (!canEditGoogleEvent(ev, state.googleCanWrite) || googleEventCrossesDay(ev)) return null
    const next = nudgedDayRange(ev.startTime, ev.endTime, mode, dir)
    if (!next) return null
    const withEvent = { ...ctx, googleEvent: ev }
    const ok =
      mode === 'move'
        ? applyBlockMove(id, ev.date, next.startTime, next.endTime, withEvent)
        : applyBlockResize(id, next.startTime, next.endTime, ev.date, withEvent)
    return ok ? { title: ev.summary, ...next } : null
  }

  const task = state.tasks.find((x) => x.id === id)
  if (!task || !task.startTime || !task.endTime) return null

  if (isLogTask(task)) {
    // 記録は実際の時刻なので、日をまたいでも暦の上でそのままずらす（0:00 の前へ動かせば前の日の記録になる）
    const iv = taskTimedInterval(task)
    if (!iv) return null
    const d = dir * NUDGE_MINUTES
    const start = mode === 'move' ? addMinutes(iv.start, d) : iv.start
    let end = addMinutes(iv.end, d)
    if (end > now) {
      // 今より先にはしない。伸ばすときは今で止める（ドラッグで端を引いたときと同じ）
      const nowMin = new Date(now)
      nowMin.setSeconds(0, 0)
      if (mode !== 'resize' || dir < 0 || nowMin <= iv.end) return null
      end = nowMin
    }
    if (mode === 'resize' && end.getTime() - start.getTime() < NUDGE_MINUTES * 60_000 && dir < 0) return null
    if (end <= start) return null
    const patch = logPatchForInterval(start, end)
    const time = `${patch.startTime}–${patch.endTime}`
    state.updateTask(
      id,
      patch,
      mode === 'move'
        ? { key: 'undo.blockMoved', params: { title: task.title, date: shortDate(patch.dueDate!), time } }
        : { key: 'undo.blockResized', params: { title: task.title, time } },
    )
    return { title: task.title, startTime: patch.startTime!, endTime: patch.endTime! }
  }

  // 予定（To-Do・予定）はその日の中で動かす。何日も続く予定はカードの時刻から直す
  const dateKey = taskPlacementDate(task)
  if (!dateKey || (task.endDate && task.endDate !== dateKey)) return null
  const next = nudgedDayRange(task.startTime, task.endTime, mode, dir)
  if (!next) return null
  const ok =
    mode === 'move'
      ? applyBlockMove(id, dateKey, next.startTime, next.endTime, ctx)
      : applyBlockResize(id, next.startTime, next.endTime, dateKey, ctx)
  return ok ? { title: task.title, ...next } : null
}

/**
 * Alt+↑↓ / Alt+Shift+↑↓ のキーでブロックを動かし、新しい時刻を読み上げる（トーストでも元に戻せる）。
 * ↑ は早く（短く）、↓ は遅く（長く）。Mac の Option でも矢印の key は ArrowUp / ArrowDown のまま来る
 */
export function nudgeBlockByKey(id: string, e: Pick<KeyboardEvent, 'key' | 'shiftKey'>): NudgeResult | null {
  const dir = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
  if (!dir) return null
  const res = nudgeTimelineBlock(id, e.shiftKey ? 'resize' : 'move', dir)
  if (res) announce(i18n.t('weekCalendar.blockTimeAnnounce', { title: res.title, start: res.startTime, end: res.endTime }))
  return res
}
