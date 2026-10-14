import type { MinuteSpan } from './unrecordedGaps'

/** 1 日の締めに出す記録の無い時間の数（それより多い日は長い順にここまで、残りは「ほか ◯ 件」） */
export const WRAP_UP_GAP_ROWS = 5

/** 抜けを見分ける印（同じ日の中で） */
export const gapKey = (g: MinuteSpan) => `${g.start}-${g.end}`

/**
 * 1 日の締めに出す記録の無い時間（#418）。「何もしていない」にした抜けは除き、長い順に `max` 件まで選んで時刻の順に並べる。
 * `more` は出さなかった数
 */
export function pickWrapUpGaps(
  gaps: readonly MinuteSpan[],
  idle: ReadonlySet<string>,
  max = WRAP_UP_GAP_ROWS,
): { shown: MinuteSpan[]; more: number } {
  const open = gaps.filter((g) => !idle.has(gapKey(g)))
  const shown = [...open]
    .sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)
    .slice(0, max)
    .sort((a, b) => a.start - b.start)
  return { shown, more: open.length - shown.length }
}

/** 「何もしていない」にした抜け（その日の分だけ。端末に残し同期しない。別の日になったら捨てる） */
const IDLE_KEY = 'chronograma-wrapup-idle-v1'

export function loadIdleGaps(dateKey: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(IDLE_KEY) ?? 'null') as { date?: unknown; keys?: unknown } | null
    if (!v || v.date !== dateKey || !Array.isArray(v.keys)) return new Set()
    return new Set(v.keys.filter((k): k is string => typeof k === 'string'))
  } catch {
    return new Set()
  }
}

export function saveIdleGaps(dateKey: string, keys: ReadonlySet<string>): void {
  try {
    localStorage.setItem(IDLE_KEY, JSON.stringify({ date: dateKey, keys: [...keys] }))
  } catch {
    /* 残せなければ、その場で隠すだけ */
  }
}
