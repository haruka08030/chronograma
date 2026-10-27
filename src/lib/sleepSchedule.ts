import { isoWeekdayOf } from './habitTiming'
import { intervalSegmentClockOnDay } from './taskTimeRange'
import { dateKeyOfDayIndex, dayIndexOf, wallMinutes } from './wallTime'
import { timeToMinutes } from './clockTime'

/**
 * 睡眠の予定（#652）。睡眠のページで決める、曜日ごとの寝る・起きる時刻。
 * 曜日は**起きる日**で決める（睡眠の記録・睡眠の行と同じく「火曜の朝」の睡眠。月曜の 24:00 過ぎに寝ても火曜の分）。
 * 決めていない曜日は枠を出さない。端末間で同期する（追加機能と同じ設定の行 `user_addons` の `sleepSchedule`）
 */
export type SleepPlan = { bed: string; wake: string }
/** ISO の曜日（1 = 月曜 … 7 = 日曜）→ その朝の睡眠 */
export type SleepSchedule = Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, SleepPlan>>

export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
export type IsoWeekday = (typeof ISO_WEEKDAYS)[number]

const isClock = (v: unknown): v is string => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) && timeToMinutes(v) < 24 * 60

export function normalizeSleepSchedule(raw: unknown): SleepSchedule {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: SleepSchedule = {}
  for (const d of ISO_WEEKDAYS) {
    const p = (raw as Record<string, unknown>)[d]
    if (!p || typeof p !== 'object') continue
    const { bed, wake } = p as Record<string, unknown>
    if (isClock(bed) && isClock(wake) && bed !== wake) out[d] = { bed, wake }
  }
  return out
}

/** その日の朝に起きる睡眠の予定 */
export function sleepPlanOn(schedule: SleepSchedule, wakeDateKey: string): SleepPlan | null {
  return schedule[isoWeekdayOf(wakeDateKey) as IsoWeekday] ?? null
}

/** タイムラインの睡眠の枠の id（`sleep-slot::<起きる日>`） */
export const sleepSlotId = (wakeDateKey: string) => `sleep-slot::${wakeDateKey}`

export interface SleepSlot {
  id: string
  /** 起きる日（✓ で作る睡眠はこの朝のもの） */
  wakeDate: string
  plan: SleepPlan
  /** その日の列にかかる区間（前の晩から続く枠は 0:00 から、次の朝まで続く枠は 24:00 まで） */
  seg: { startTime: string; endTime: string }
  /** 枠が日をまたぐか */
  crossesDay: boolean
}

/**
 * その日の列に描く睡眠の枠。その日の朝に起きる睡眠（前の晩から）と、次の朝に起きる睡眠（その日の夜から）。
 * 寝る時刻が起きる時刻より後なら前の晩に寝る（23:30 → 7:00）、前なら同じ日（1:00 → 8:00。記録の `sleepSpan` と同じ）
 */
export function sleepSlotsOnDay(schedule: SleepSchedule, dateKey: string): SleepSlot[] {
  const day = dayIndexOf(dateKey)
  return [dateKey, dateKeyOfDayIndex(day + 1)].flatMap((wakeDate) => {
    const plan = sleepPlanOn(schedule, wakeDate)
    if (!plan) return []
    const end = wallMinutes(wakeDate, plan.wake)
    const crossesDay = timeToMinutes(plan.bed) > timeToMinutes(plan.wake)
    const start = crossesDay ? wallMinutes(dateKeyOfDayIndex(dayIndexOf(wakeDate) - 1), plan.bed) : wallMinutes(wakeDate, plan.bed)
    const seg = intervalSegmentClockOnDay({ start, end }, dateKey)
    return seg ? [{ id: sleepSlotId(wakeDate), wakeDate, plan, seg, crossesDay }] : []
  })
}
