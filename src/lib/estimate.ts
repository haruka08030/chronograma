/** 見積もりの上限（分）。1 日ぶん */
const MAX_ESTIMATE_MINUTES = 24 * 60

/** 保存・同期から読んだ見積もり。正の整数（分）でなければ null */
export function readEstimateMinutes(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  const m = Math.round(raw)
  return m > 0 ? Math.min(m, MAX_ESTIMATE_MINUTES) : null
}

/** 見積もりで選べる長さ（分）。詳細と追加の欄で共通 */
export const ESTIMATE_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240] as const

/** 選択肢に今の値が無ければ足す（クイック入力の「1時間10分」など） */
export function estimateOptionsWith(current: number | null): number[] {
  const base: number[] = [...ESTIMATE_OPTIONS]
  return current == null || base.includes(current) ? base : [...base, current].sort((a, b) => a - b)
}
