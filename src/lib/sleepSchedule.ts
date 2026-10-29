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

/**
 * その朝だけの睡眠の予定（#660）。起きる日 → その日だけの時刻、null はその日は予定なし。無い日は曜日の予定。
 * タイムラインの枠を動かす・伸ばす・カードで直す・消すと入る。端末間で同期する（`sleepSchedule` と同じ設定の行の `sleepDays`）
 */
export type SleepDays = Record<string, SleepPlan | null>

export function normalizeSleepDays(raw: unknown): SleepDays {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: SleepDays = {}
  for (const [k, p] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue
    if (p === null) out[k] = null
    else if (p && typeof p === 'object') {
      const { bed, wake } = p as Record<string, unknown>
      if (isClock(bed) && isClock(wake) && bed !== wake) out[k] = { bed, wake }
    }
  }
  return out
}

/** 7 日とも同じ時刻ならその時刻（睡眠のページで「毎日」の 1 行で見せる、#659）。曜日で違う・決めていない曜日があれば null */
export function sameSleepPlan(schedule: SleepSchedule): SleepPlan | null {
  const first = schedule[1]
  if (!first) return null
  return ISO_WEEKDAYS.every((d) => schedule[d]?.bed === first.bed && schedule[d]?.wake === first.wake) ? first : null
}

/** 「毎日同じ時間にする」で 7 日に入れる時刻: いちばん多い時刻、同じ数なら月曜に近い曜日の時刻 */
export function commonSleepPlan(schedule: SleepSchedule): SleepPlan | null {
  let best: SleepPlan | null = null
  let bestCount = 0
  for (const d of ISO_WEEKDAYS) {
    const p = schedule[d]
    if (!p) continue
    const count = ISO_WEEKDAYS.filter((x) => schedule[x]?.bed === p.bed && schedule[x]?.wake === p.wake).length
    if (count > bestCount) {
      best = p
      bestCount = count
    }
  }
  return best
}

/** 7 日とも同じ時刻の予定 */
export const everyDaySleepSchedule = (plan: SleepPlan): SleepSchedule =>
  Object.fromEntries(ISO_WEEKDAYS.map((d) => [d, { bed: plan.bed, wake: plan.wake }])) as SleepSchedule

/** その日の朝に起きる睡眠の予定（その朝だけの時刻・予定なしがあればそれ、無ければ曜日の予定） */
export function sleepPlanOn(schedule: SleepSchedule, wakeDateKey: string, days?: SleepDays): SleepPlan | null {
  if (days && wakeDateKey in days) return days[wakeDateKey] ?? null
  return schedule[isoWeekdayOf(wakeDateKey) as IsoWeekday] ?? null
}

/** タイムラインの睡眠の枠の id（`sleep-slot::<起きる日>`） */
export const sleepSlotId = (wakeDateKey: string) => `sleep-slot::${wakeDateKey}`

/** 睡眠の枠の id なら起きる日 */
export function parseSleepSlotId(id: string): string | null {
  const m = /^sleep-slot::(\d{4}-\d{2}-\d{2})$/.exec(id)
  return m ? m[1]! : null
}

/** 睡眠の予定を記録と同じ形（寝た日・起きた日・時刻）に。枠を動かす・伸ばす計算に記録の道を使う */
export function sleepPlanSpan(
  wakeDateKey: string,
  plan: SleepPlan,
): { dueDate: string; endDate: string | null; startTime: string; endTime: string } {
  const crosses = timeToMinutes(plan.bed) > timeToMinutes(plan.wake)
  return {
    dueDate: crosses ? dateKeyOfDayIndex(dayIndexOf(wakeDateKey) - 1) : wakeDateKey,
    endDate: crosses ? wakeDateKey : null,
    startTime: plan.bed,
    endTime: plan.wake,
  }
}

export interface SleepSlot {
  id: string
  /** 起きる日（✓ で作る睡眠はこの朝のもの） */
  wakeDate: string
  plan: SleepPlan
  /** その日の列にかかる区間（前の晩から続く枠は 0:00 から、次の朝まで続く枠は 24:00 まで） */
  seg: { startTime: string; endTime: string }
  /** 枠が日をまたぐか */
  crossesDay: boolean
  /** その朝だけの時刻（曜日の予定から変えた） */
  changed: boolean
}

/**
 * その日の列に描く睡眠の枠。その日の朝に起きる睡眠（前の晩から）と、次の朝に起きる睡眠（その日の夜から）。
 * 寝る時刻が起きる時刻より後なら前の晩に寝る（23:30 → 7:00）、前なら同じ日（1:00 → 8:00。記録の `sleepSpan` と同じ）
 */
export function sleepSlotsOnDay(schedule: SleepSchedule, dateKey: string, days?: SleepDays): SleepSlot[] {
  const day = dayIndexOf(dateKey)
  return [dateKey, dateKeyOfDayIndex(day + 1)].flatMap((wakeDate) => {
    const plan = sleepPlanOn(schedule, wakeDate, days)
    if (!plan) return []
    const end = wallMinutes(wakeDate, plan.wake)
    const crossesDay = timeToMinutes(plan.bed) > timeToMinutes(plan.wake)
    const start = crossesDay ? wallMinutes(dateKeyOfDayIndex(dayIndexOf(wakeDate) - 1), plan.bed) : wallMinutes(wakeDate, plan.bed)
    const seg = intervalSegmentClockOnDay({ start, end }, dateKey)
    const changed = !!days && wakeDate in days
    return seg ? [{ id: sleepSlotId(wakeDate), wakeDate, plan, seg, crossesDay, changed }] : []
  })
}
