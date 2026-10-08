/**
 * ラベルの週の目安（「週に◯時間」、#291）。ラベル名 → 分で持ち、ラベル表と一緒に同期する（`labelSync.ts`）。
 * 目安は任意。ふりかえりのラベル別の行に「記録 / 目安」と細い線を足すだけで、届かなくても言葉は出さない（数字だけ）
 */
import { endOfMonth } from 'date-fns'
import type { ReviewPeriod } from './reviewPeriod'

/** ラベル名 → 週の目安（分） */
export type LabelTargets = Record<string, number>

/** 週の目安の上限（1 週間ぶん） */
export const MAX_TARGET_MINUTES = 7 * 24 * 60

/** 目安として使える分（正の数を分に丸めたもの、上限まで）か。それ以外（0・負・数でない）は目安なし */
export function validTargetMinutes(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  const m = Math.min(MAX_TARGET_MINUTES, Math.round(v))
  return m > 0 ? m : undefined
}

/** 保存されていた値（壊れていてもよい）を目安の表にする */
export function normalizeLabelTargets(raw: unknown): LabelTargets {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: LabelTargets = {}
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    const m = validTargetMinutes(v)
    if (name && m) out[name] = m
  }
  return out
}

/**
 * 目安の欄に書いた時間（時間単位。「15」「1.5」「１５」）を分にする。空・0 は目安なし（null）、読めなければ undefined。
 * 1 週間より多い時間は 1 週間に丸める
 */
export function parseTargetHours(text: string): number | null | undefined {
  const s = text.normalize('NFKC').trim().replace(/,/g, '.')
  if (s === '') return null
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return undefined
  const minutes = Math.round(Number(s) * 60)
  return minutes > 0 ? Math.min(MAX_TARGET_MINUTES, minutes) : null
}

/** 目安の欄に出す時間（「15」「1.5」。小数は 2 桁まで） */
export function targetHoursInput(minutes: number | undefined): string {
  return minutes ? String(Math.round((minutes / 60) * 100) / 100) : ''
}

/** 「記録 / 目安」に出す時間（小数 1 桁、「6.5」「15」「0」） */
export function hoursText(minutes: number): string {
  return String(Math.round(minutes / 6) / 10)
}

/**
 * その期間の目安（分）。週はそのまま。月は週の目安をその月の日数に合わせる（× 日数 ÷ 7。30 分に丸める）。
 * 月の途中でも月全体の目安（線は月の終わりに向かって伸びる。週の途中の週の目安と同じ見方）
 */
export function periodTargetMinutes(weekly: number, period: ReviewPeriod, anchor: Date): number {
  if (period === 'week') return weekly
  const days = endOfMonth(anchor).getDate()
  return Math.max(30, Math.round((weekly * days) / 7 / 30) * 30)
}
