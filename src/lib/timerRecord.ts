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

/** 記録中の枠の id（タイムラインの記録の列に、止めたときの記録と同じ形で描く） */
export const RUNNING_LOG_ID = 'running-timer'

/**
 * 記録中のタイマーを、止めたら入る記録と同じ日付・時刻の形にする（終わりは今。1 分未満は 1 分ぶん）。
 * 記録の列で始めた時刻から今まで伸びる枠にするため
 */
export function runningLogTimes(startedAt: string, nowMs: number): TimerRecordTimes | null {
  const startMs = new Date(startedAt).getTime()
  if (!Number.isFinite(startMs)) return null
  return timerRecordTimes(startedAt, new Date(Math.max(nowMs, startMs + MIN_RECORD_MS)).toISOString())
}
