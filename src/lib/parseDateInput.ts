import { toDateKey } from './dateKey'
import { appToday } from './timeZone'
import { parseQuickAddTitle } from './parseQuickAdd'

/** その年月日が本当にある日なら日付キー（2/30 などは null） */
function keyOf(year: number, month: number, day: number): string | null {
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? toDateKey(d) : null
}

/**
 * 日付ピッカーの入力欄に打った文字を日付キー（`yyyy-MM-dd`）にする。読めなければ null。
 * - 数字だけ: `20` / `20日`（見ている月のその日）・`1020` / `102`（10/20・1/02 のような月日）・`20261020`（年月日）
 * - 区切り: `10/20` `10-20` `10.20` `2026.10.20`（`-` `.` は `/` と同じ）
 * - それ以外はクイック追加と同じ言い方（明日・金曜・来週金曜・3日後・10月20日・Dec 5 など）。
 *   月日だけのときの年の決め方もクイック追加と同じ
 */
export function parseDateInput(
  raw: string,
  localeJa: boolean,
  /** 日だけ（`20`）のときの月（ピッカーで見ている月） */
  month: Date,
  today: Date = appToday(),
): string | null {
  const text = raw.normalize('NFKC').trim()
  if (!text) return null
  let m: RegExpMatchArray | null
  if ((m = text.match(/^(\d{1,2})日?$/))) return keyOf(month.getFullYear(), month.getMonth() + 1, Number(m[1]))
  if ((m = text.match(/^(\d{4})(\d{2})(\d{2})$/))) return keyOf(Number(m[1]), Number(m[2]), Number(m[3]))
  // 月日の数字（3 桁は 1 桁の月、4 桁は 2 桁の月）はクイック追加の「10/20」と同じに読む
  const md = text.match(/^(\d{1,2})(\d{2})$/)
  const slashed = md
    ? `${md[1]}/${md[2]}`
    : text.replace(/^(\d{1,4})[-.](\d{1,2})(?:[-.](\d{1,2}))?$/, (_, a, b, c) => (c ? `${a}/${b}/${c}` : `${a}/${b}`))
  const parsed = parseQuickAddTitle(slashed, localeJa, today, { lists: false })
  // 日付の言い方だけで書いたときだけ（題名が残れば、書いたもの丸ごとが題名に戻る）
  if (!parsed.date || parsed.title !== slashed.trim() || parsed.startTime || parsed.repeat) return null
  return parsed.date
}
