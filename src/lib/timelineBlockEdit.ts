import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import { isLogTask, type Task } from '../types/task'
import { canCopyOnDrop, placeCopies } from './dragCopy'
import type { CalendarEvent } from '../types/calendarEvent'
import { isPlacedPointHabitOn, isPointHabitOn, parseHabitSlotId, habitToPlannedItem } from './habitSlots'
import { buildHabitRecordIndex, habitDayStatus, habitTimesOn } from './habitTiming'
import { canSetMyEventTime, setMyGoogleEventTime } from './googleEventEdit'
import { googleEventTiming, movedGoogleEventTiming } from './googleCalendar'
import { googleEventCrossesDay } from './googleEventSpan'
import { SNAP_MINUTES, timeToMinutes } from './timeGrid'
import { endWithinDay, minutesOfDay, minutesToTime } from './clockTime'
import { toDateKey } from './dateKey'
import { shortDate } from './moveToast'
import { zonedNow } from './timeZone'
import {
  isOvernightTimeLog,
  logPatchForInterval,
  patchAfterLogResize,
  patchAfterTimelineMove,
  taskPlacementDate,
  taskWallInterval,
} from './taskTimeRange'
import { wallMinutes, wallMinutesOf, wallParts } from './wallTime'
import { parseSleepSlotId, sleepPlanOn, sleepPlanSpan, sleepSlotsOnDay } from './sleepSchedule'
import { announce } from './announce'
import { TASK_DEFAULTS } from './taskDefaults'

/**
 * タイムラインのブロック（予定・記録・習慣の枠・Google の予定）の時刻を変える処理。
 * マウスのドラッグ（`WeekCalendarView`）とキー（Alt+↑↓・Alt+Shift+↑↓）が同じ道を通る。
 * どちらも元に戻せる（Google の予定は Google へは送らず、自分の時間にする。#625）
 */

/** その日の記録に使える最後の分（null は制限なし＝過去の日）。記録は今より先には作れない */
export type LogLimit = (dateKey: string) => number | null

export function logLimitAt(now: Date): LogLimit {
  const todayKey = toDateKey(now)
  return (key) => (key < todayKey ? null : key > todayKey ? 0 : minutesOfDay(now))
}

export type BlockEditContext = {
  logLimit: LogLimit
  /** 動かしている Google の予定（ドラッグはつかんだ時点のもの。週をめくって一覧から消えても動かせるように） */
  googleEvent?: CalendarEvent | null
  /** ⌥ を押しながら離した: 元は動かさず、置いた先に複製を作る（アプリの予定・To-Do だけ。ほかは何もしない、`dragCopy.ts`） */
  copy?: boolean
}

/** 習慣の枠を動かした・伸ばした: その日だけの時間にする */
/** 習慣の枠をその日だけの時間にする（枠を動かす・伸ばす、習慣の段のチップを格子に置く） */
export function setHabitDayTimeFromSlot(slot: { habitId: string; dateKey: string }, startTime: string, endTime: string) {
  const { habits, setHabitDayTime } = useTaskStore.getState()
  const habit = habits.find((h) => h.id === slot.habitId)
  if (!habit) return
  setHabitDayTime(habit.id, slot.dateKey, startTime, endTime, {
    key: 'undo.habitDayTime',
    params: { name: habit.title, date: shortDate(slot.dateKey), time: `${startTime}–${endTime}` },
  })
}

/** その朝の睡眠の予定（その朝だけの時刻があればそれ） */
function sleepPlanFor(wakeDate: string) {
  const { sleepSchedule, sleepDays } = useTaskStore.getState().addons
  return sleepPlanOn(sleepSchedule ?? {}, wakeDate, sleepDays)
}

/**
 * 睡眠の枠を、寝る・起きる（壁時計の通しの分）にしてその朝だけの時刻にする（#660）。
 * 起きる日が変わる・15 分より短いときは変えない（false）
 */
function setSleepSlotSpan(wakeDate: string, start: number, end: number): boolean {
  const s = wallParts(start)
  const e = wallParts(end)
  if (end - start < SNAP_MINUTES || e.date !== wakeDate || end - start >= 24 * 60) return false
  const plan = sleepPlanFor(wakeDate)
  if (plan && plan.bed === s.time && plan.wake === e.time) return false
  useTaskStore
    .getState()
    .setSleepPlanDay(
      wakeDate,
      { bed: s.time, wake: e.time },
      { key: 'undo.sleepDayTime', params: { date: shortDate(wakeDate), time: `${s.time}–${e.time}` } },
    )
  return true
}

/** 睡眠の枠の寝る・起きる（壁時計の通しの分） */
function sleepSlotInterval(wakeDate: string): { start: number; end: number } | null {
  const plan = sleepPlanFor(wakeDate)
  if (!plan) return null
  const span = sleepPlanSpan(wakeDate, plan)
  return { start: wallMinutes(span.dueDate, plan.bed), end: wallMinutes(wakeDate, plan.wake) }
}

/**
 * 睡眠の枠を動かした: 列に描いている区間の始まりが `dateKey` の `startTime` へ動いたぶん、寝る・起きるを同じだけずらす。
 * 日をまたぐ枠はどちらの列の区間をつかんだか分からないので、近いほうの区間からのずれにする
 */
function moveSleepSlot(wakeDate: string, dateKey: string, startTime: string): boolean {
  const iv = sleepSlotInterval(wakeDate)
  if (!iv) return false
  const { sleepSchedule, sleepDays } = useTaskStore.getState().addons
  const to = wallMinutes(dateKey, startTime)
  const segStarts = [
    dateKey,
    wallParts(wallMinutes(dateKey, '00:00') - 1).date,
    wallParts(wallMinutes(dateKey, '00:00') + 24 * 60).date,
  ].flatMap((day) =>
    sleepSlotsOnDay(sleepSchedule ?? {}, day, sleepDays)
      .filter((x) => x.wakeDate === wakeDate)
      .map((x) => wallMinutes(day, x.seg.startTime)),
  )
  if (segStarts.length === 0) return false
  const from = segStarts.reduce((a, b) => (Math.abs(to - b) < Math.abs(to - a) ? b : a))
  const d = to - from
  return d !== 0 && setSleepSlotSpan(wakeDate, iv.start + d, iv.end + d)
}

/** ブロックを `dateKey` の `startTime` へ動かす（長さは保つ）。動かしたら true */
export function applyBlockMove(taskId: string, dateKey: string, startTime: string, endTime: string, ctx: BlockEditContext): boolean {
  if (ctx.copy) {
    if (!canCopyOnDrop(taskId)) return false
    return placeCopies([taskId], (t) => patchAfterTimelineMove(t, dateKey, startTime, endTime)).length > 0
  }
  const sleepWake = parseSleepSlotId(taskId)
  if (sleepWake) return moveSleepSlot(sleepWake, dateKey, startTime)
  const habitSlot = parseHabitSlotId(taskId)
  if (habitSlot) {
    // 習慣の枠はその日の中だけ動かせる（ほかの日へ持っていったら元に戻す）
    if (dateKey !== habitSlot.dateKey) return false
    setHabitDayTimeFromSlot(habitSlot, startTime, endTime)
    return true
  }
  if (taskId.startsWith('event-')) {
    const ev = ctx.googleEvent
    // 元の枠に戻しただけなら何もしない。動かすときは長さ（日をまたぐ予定は終わりの日も）を保つ
    if (!ev || (ev.date === dateKey && ev.startTime === startTime)) return false
    setMyGoogleEventTime(ev, movedGoogleEventTiming(ev, dateKey, startTime))
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
  const sleepWake = parseSleepSlotId(taskId)
  if (sleepWake) {
    // 日をまたぐ記録と同じく、引いた列の区間の端だけを変える
    const plan = sleepPlanFor(sleepWake)
    if (!plan) return false
    const pseudo = { ...TASK_DEFAULTS, id: taskId, title: '', kind: 'log', completed: true, ...sleepPlanSpan(sleepWake, plan) } as Task
    const patch = patchAfterLogResize(pseudo, dateKey, startTime, endTime)
    if (!patch?.dueDate || !patch.startTime || !patch.endTime) return false
    const start = wallMinutes(patch.dueDate, patch.startTime)
    let end = wallMinutes(patch.endDate ?? patch.dueDate, patch.endTime)
    if (end <= start) end += 24 * 60
    return setSleepSlotSpan(sleepWake, start, end)
  }
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
    setMyGoogleEventTime(ev, { date: ev.date, endDate, startTime, endTime })
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
    const next = taskWallInterval({ ...prev, ...patch } as Task)
    if (!next || next.end > wallMinutesOf(zonedNow())) return false
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
 * 済んだ習慣の枠・終日の Google の予定・日をまたぐ Google の予定は動かさない。変えたら新しい時刻
 */
export function nudgeTimelineBlock(id: string, mode: NudgeMode, dir: -1 | 1, now: Date = zonedNow()): NudgeResult | null {
  const state = useTaskStore.getState()
  const ctx: BlockEditContext = { logLimit: logLimitAt(now) }

  const sleepWake = parseSleepSlotId(id)
  if (sleepWake) {
    // 睡眠の枠: 寝る・起きるを 15 分ずらす・起きるを 15 分伸び縮み（日をまたいでも 1 つの睡眠として）
    const iv = sleepSlotInterval(sleepWake)
    if (!iv) return null
    const d = dir * NUDGE_MINUTES
    const ok = setSleepSlotSpan(sleepWake, mode === 'move' ? iv.start + d : iv.start, iv.end + d)
    const plan = sleepPlanFor(sleepWake)
    return ok && plan ? { title: i18n.t('sleep.title'), startTime: plan.bed, endTime: plan.wake } : null
  }

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
    if (!canSetMyEventTime(ev) || googleEventCrossesDay(ev)) return null
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
    const iv = taskWallInterval(task)
    if (!iv) return null
    const d = dir * NUDGE_MINUTES
    const start = mode === 'move' ? iv.start + d : iv.start
    let end = iv.end + d
    // 今（秒は切り捨てた分）より先にはしない。伸ばすときは今で止める（ドラッグで端を引いたときと同じ）
    const nowMin = wallMinutesOf(now)
    if (end > nowMin) {
      if (mode !== 'resize' || dir < 0 || nowMin <= iv.end) return null
      end = nowMin
    }
    if (mode === 'resize' && end - start < NUDGE_MINUTES && dir < 0) return null
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

/** 格子に置いた時刻ひとつの習慣を、その日のチップに戻す（「元に戻す」付き） */
export function unplaceHabitSlot(slotId: string): boolean {
  const slot = parseHabitSlotId(slotId)
  if (!slot) return false
  const { habits, clearHabitDayTime } = useTaskStore.getState()
  const habit = habits.find((h) => h.id === slot.habitId)
  if (!habit || !isPlacedPointHabitOn(habit, slot.dateKey)) return false
  clearHabitDayTime(habit.id, slot.dateKey, { key: 'undo.habitUnplaced', params: { name: habit.title, date: shortDate(slot.dateKey) } })
  return true
}

/**
 * 習慣の段のチップを、その日だけ習慣の時刻からの枠にする（カードの「時間に置く」。指ではドラッグできないため）。
 * 長さは既定の予定の長さ（目標のある習慣ははじめから枠なのでチップにならない）
 */
export function placeHabitSlot(slotId: string): boolean {
  const slot = parseHabitSlotId(slotId)
  if (!slot) return false
  const { habits, defaultBlockMinutes } = useTaskStore.getState()
  const habit = habits.find((h) => h.id === slot.habitId)
  const times = habit ? habitTimesOn(habit, slot.dateKey) : null
  if (!habit || !times || !isPointHabitOn(habit, slot.dateKey)) return false
  setHabitDayTimeFromSlot(slot, times.startTime, endWithinDay(times.startTime, defaultBlockMinutes))
  return true
}
