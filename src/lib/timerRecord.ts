/**
 * タイマーを記録（タイムログ）に変換するときの日付・時刻の計算。
 *
 * 止め忘れたタイマーをそのまま「今」で閉じるとその日の記録が歪むため、
 * 終了時刻を選べるようにしている。1 分未満は誤操作として記録しない
 * （開始と終了が同じ `HH:mm` になると「終了が開始以前＝翌日まで」の規則で
 * 約 24 時間のログになってしまう）。
 */

import { toAppWall } from './timeZone'
import { toDateKey } from './dateKey'
import { clockOf } from './clockTime'

/** 記録として成立する最小の長さ */
export const MIN_RECORD_MS = 60_000

export interface TimerRecordTimes {
  /** 開始日（`yyyy-MM-dd`） */
  dueDate: string
  /** 日をまたぐときだけ終了日。同日は null */
  endDate: string | null
  startTime: string
  endTime: string
}

/**
 * 開始・終了から記録の日付と時刻を作る。
 * 記録として短すぎる / 終了が開始より前 / 日付が壊れている場合は null。
 */
export function timerRecordTimes(startedAt: string, endedAt: string): TimerRecordTimes | null {
  const startMs = new Date(startedAt).getTime()
  const endMs = new Date(endedAt).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  if (endMs - startMs < MIN_RECORD_MS) return null
  // 記録の日付・時刻はアプリのタイムゾーンの壁時計
  const start = toAppWall(startMs)
  const end = toAppWall(endMs)

  const dueDate = toDateKey(start)
  const endDay = toDateKey(end)
  return {
    dueDate,
    endDate: endDay !== dueDate ? endDay : null,
    startTime: clockOf(start),
    endTime: clockOf(end),
  }
}
