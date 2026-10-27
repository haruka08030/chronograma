/**
 * 睡眠のページで決める値のうち、端末に保存するもの（#628。同期しない。1 日に使える時間と同じ）。
 * - 目標の睡眠時間: 一覧で届かなかった夜・週と月の平均の目標との差を出す。無ければ出さない
 * 曜日ごとの寝る・起きる時刻は睡眠の予定（`lib/sleepSchedule.ts`、同期する）
 */
export type SleepPrefs = {
  goalMinutes: number | null
}

export const DEFAULT_SLEEP_PREFS: SleepPrefs = { goalMinutes: null }

/** 選べる目標（時間） */
export const SLEEP_GOAL_HOURS = [6, 6.5, 7, 7.5, 8, 8.5, 9] as const

export function normalizeSleepPrefs(raw: unknown): SleepPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_SLEEP_PREFS
  const x = raw as Record<string, unknown>
  const goal = typeof x.goalMinutes === 'number' && Number.isFinite(x.goalMinutes) ? Math.round(x.goalMinutes) : null
  return { goalMinutes: goal !== null && goal >= 3 * 60 && goal <= 12 * 60 ? goal : null }
}
