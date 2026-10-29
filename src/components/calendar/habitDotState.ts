import { timeToMinutes } from '../../lib/timeGrid'
import type { DotState } from './HabitDotMark'

/**
 * その日の習慣が始まった（✓ で達成にできる）か。`limit` はその日に記録できる終わり（分。null は過ぎた日で制限なし）。
 * 時刻つきはその時刻から、時間なしは今日と過ぎた日（先の日の記録は付けない）
 */
export function habitStarted(time: string | null, limit: number | null): boolean {
  return limit === null || (time === null ? limit > 0 : timeToMinutes(time) < limit)
}

/**
 * 習慣の丸の状態（段・一覧・スマホの 1 日表示で同じにする）。達成（時間外にやった日は時間外）、まだ始まっていない（今日の先の時刻・先の日）は先、
 * 過ぎた日のやらなかった分は過ぎた、それ以外（今日の始まった分）は今日
 */
export function habitDotState(
  item: { time: string | null; done: boolean; offTime?: boolean },
  dateKey: string,
  todayKey: string,
  limit: number | null,
): DotState {
  if (item.done) return item.offTime ? 'offTime' : 'done'
  if (!habitStarted(item.time, limit)) return 'future'
  return dateKey < todayKey ? 'missed' : 'today'
}
