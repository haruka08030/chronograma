import { timeToMinutes } from './clockTime'

/**
 * 睡眠のページで決める値（#628。端末に保存し、同期しない。1 日に使える時間と同じ）。
 * - いつもの時刻: まだ記録の無い夜の入力欄に最初に入れる寝た・起きた時刻。無ければ前回の睡眠の時刻
 * - 目標の睡眠時間: 一覧で届かなかった夜・週と月の平均の目標との差を出す。無ければ出さない
 */
export type SleepPrefs = {
  usualBed: string | null
  usualWake: string | null
  goalMinutes: number | null
}

export const DEFAULT_SLEEP_PREFS: SleepPrefs = { usualBed: null, usualWake: null, goalMinutes: null }

/** 選べる目標（時間） */
export const SLEEP_GOAL_HOURS = [6, 6.5, 7, 7.5, 8, 8.5, 9] as const

const isClock = (v: unknown): v is string => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) && timeToMinutes(v) < 24 * 60

export function normalizeSleepPrefs(raw: unknown): SleepPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_SLEEP_PREFS
  const x = raw as Record<string, unknown>
  const bed = isClock(x.usualBed) ? x.usualBed : null
  const wake = isClock(x.usualWake) ? x.usualWake : null
  const goal = typeof x.goalMinutes === 'number' && Number.isFinite(x.goalMinutes) ? Math.round(x.goalMinutes) : null
  // いつもの時刻は 2 つそろって意味がある（片方だけなら使わない）
  const both = bed && wake && bed !== wake
  return {
    usualBed: both ? bed : null,
    usualWake: both ? wake : null,
    goalMinutes: goal !== null && goal >= 3 * 60 && goal <= 12 * 60 ? goal : null,
  }
}
