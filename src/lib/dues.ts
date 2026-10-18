import { addMonths, differenceInCalendarDays, getDaysInMonth } from 'date-fns'
import { fromDateKey, toDateKey } from './dateKey'

/**
 * 引き落とし・期限の日（#454、追加機能の 1 つ）。家賃・サブスクの引き落とし、無料体験の終わり、パスポートの期限など。
 * To-Do には混ぜない（やることではなく「その日に起きること」）。カレンダーには祝日と同じ所に小さな印、
 * 今日の計画には当日と、知らせ始める日（何日前）から当日までだけ出す。統計・やり残しには数えない。
 * 追加機能の設定（`user_addons.addons.dues`）に持ち、端末間で同期する
 */
export type DueRepeat = 'none' | 'monthly' | 'yearly'

export type DueItem = {
  id: string
  title: string
  /** `yyyy-MM-dd`。繰り返すものは最初の日（毎月はこの日の「日」、毎年は「月日」で繰り返す） */
  date: string
  repeat: DueRepeat
  /** 何日前から今日の計画に出すか（0 は当日だけ） */
  notifyDays: number
}

/** 「何日前から知らせるか」の選択肢 */
export const DUE_NOTIFY_OPTIONS = [0, 1, 3, 7, 30] as const
/** 持てる数・名前の長さ（`user_addons` の大きさの上限に十分収まる） */
export const DUE_MAX = 200
export const DUE_TITLE_MAX = 100

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const REPEATS: readonly DueRepeat[] = ['none', 'monthly', 'yearly']

/** 保存・同期から読んだ値をそろえる。形の合わないものは落とし、同じ id は先のものだけ */
export function normalizeDues(raw: unknown): DueItem[] {
  if (!Array.isArray(raw)) return []
  const out: DueItem[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const x = item as Partial<Record<keyof DueItem, unknown>> | null
    if (!x || typeof x.id !== 'string' || !x.id || seen.has(x.id)) continue
    if (typeof x.title !== 'string' || !x.title.trim()) continue
    if (typeof x.date !== 'string' || !DATE_KEY.test(x.date)) continue
    const repeat = REPEATS.includes(x.repeat as DueRepeat) ? (x.repeat as DueRepeat) : 'none'
    const n = typeof x.notifyDays === 'number' && Number.isInteger(x.notifyDays) ? x.notifyDays : 0
    seen.add(x.id)
    out.push({ id: x.id, title: x.title.trim().slice(0, DUE_TITLE_MAX), date: x.date, repeat, notifyDays: Math.min(Math.max(n, 0), 365) })
    if (out.length >= DUE_MAX) break
  }
  return out
}

/** その月の、最初の日の「日」に当たる日（31 日は 30 日の月は 30 日、2 月は末日） */
function dayInMonth(year: number, month: number, day: number): string {
  const last = getDaysInMonth(new Date(year, month, 1))
  return toDateKey(new Date(year, month, Math.min(day, last)))
}

/** `from` 以降でいちばん早い日。過ぎた 1 回きりのものは null */
export function nextDueDate(item: Pick<DueItem, 'date' | 'repeat'>, from: string): string | null {
  if (from <= item.date) return item.date
  if (item.repeat === 'none') return null
  const start = fromDateKey(item.date)
  const day = start.getDate()
  const f = fromDateKey(from)
  if (item.repeat === 'monthly') {
    const here = dayInMonth(f.getFullYear(), f.getMonth(), day)
    if (here >= from) return here
    const next = addMonths(new Date(f.getFullYear(), f.getMonth(), 1), 1)
    return dayInMonth(next.getFullYear(), next.getMonth(), day)
  }
  const thisYear = dayInMonth(f.getFullYear(), start.getMonth(), day)
  return thisYear >= from ? thisYear : dayInMonth(f.getFullYear() + 1, start.getMonth(), day)
}

/** その日が期限の日か */
export const isDueOn = (item: Pick<DueItem, 'date' | 'repeat'>, dateKey: string) => nextDueDate(item, dateKey) === dateKey

/** その日の期限（カレンダーの印）。名前順 */
export function duesOn(items: readonly DueItem[], dateKey: string): DueItem[] {
  return items.filter((d) => isDueOn(d, dateKey)).sort((a, b) => a.title.localeCompare(b.title))
}

export type DueSoon = { item: DueItem; date: string; daysLeft: number }

/** 今日の計画に出す期限: 次の日まで `notifyDays` 日以内のもの（当日は必ず）。近い順 */
export function duesSoon(items: readonly DueItem[], today: string): DueSoon[] {
  const out: DueSoon[] = []
  for (const item of items) {
    const date = nextDueDate(item, today)
    if (!date) continue
    const daysLeft = differenceInCalendarDays(fromDateKey(date), fromDateKey(today))
    if (daysLeft <= item.notifyDays) out.push({ item, date, daysLeft })
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.item.title.localeCompare(b.item.title))
}

/** 残りの日数の色の段階（締切と同じ: 当日はオレンジ、明日は薄いオレンジ、それより先は灰色） */
export function dueSoonTone(daysLeft: number): 'today' | 'tomorrow' | 'future' {
  if (daysLeft <= 0) return 'today'
  if (daysLeft === 1) return 'tomorrow'
  return 'future'
}
