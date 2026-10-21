/**
 * 引き落とし・期限の日（#454、追加機能）の日付の決め方と、知らせる日。アプリ（`src/lib/dues.ts`）と通知（`index.ts`、Deno）の両方から読むので依存は持たない。
 * 1 件は `user_addons.addons.dues` の 1 行（名前・日付・繰り返し・何日前から知らせるか）
 */
import { dayWallMs, wallDate } from './schedule.ts'

export type DueRepeat = 'none' | 'monthly' | 'yearly'

export type DueItem = {
  id: string
  title: string
  /** `yyyy-MM-dd`。繰り返すものは最初の日（毎月はこの日の「日」、毎年は「月日」で繰り返す） */
  date: string
  repeat: DueRepeat
  /** 何日前から知らせるか（0 は当日だけ） */
  notifyDays: number
}

/** 持てる数・名前の長さ（`user_addons` の大きさの上限に十分収まる） */
export const DUE_MAX = 200
export const DUE_TITLE_MAX = 100

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const REPEATS: readonly DueRepeat[] = ['none', 'monthly', 'yearly']
const DAY_MS = 86_400_000

/** 保存・同期から読んだ値をそろえる。形の合わないものは落とし、同じ id は先のものだけ */
export function normalizeDues(raw: unknown): DueItem[] {
  if (!Array.isArray(raw)) return []
  const out: DueItem[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const x = item as Partial<Record<keyof DueItem, unknown>> | null
    if (!x || typeof x.id !== 'string' || !x.id || seen.has(x.id)) continue
    if (typeof x.title !== 'string' || !x.title.trim()) continue
    if (typeof x.date !== 'string' || !DATE_KEY.test(x.date) || dayWallMs(x.date) == null) continue
    const repeat = REPEATS.includes(x.repeat as DueRepeat) ? (x.repeat as DueRepeat) : 'none'
    const n = typeof x.notifyDays === 'number' && Number.isInteger(x.notifyDays) ? x.notifyDays : 0
    seen.add(x.id)
    out.push({ id: x.id, title: x.title.trim().slice(0, DUE_TITLE_MAX), date: x.date, repeat, notifyDays: Math.min(Math.max(n, 0), 365) })
    if (out.length >= DUE_MAX) break
  }
  return out
}

/** その月（`month` は 0 始まり）の、`day` 日に当たる日（無い日は月末） */
function dayInMonth(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return wallDate(Date.UTC(year, month, Math.min(day, last)))
}

/** `from` 以降でいちばん早い日。過ぎた 1 回きりのものは null（毎月 31 日は 30 日までの月は 30 日、2 月 29 日はうるう年でない年は 28 日） */
export function nextDueDate(item: Pick<DueItem, 'date' | 'repeat'>, from: string): string | null {
  if (from <= item.date) return item.date
  if (item.repeat === 'none') return null
  const [, sm, sd] = item.date.split('-').map(Number)
  const [fy, fm] = from.split('-').map(Number)
  if (item.repeat === 'monthly') {
    const here = dayInMonth(fy, fm - 1, sd)
    return here >= from ? here : dayInMonth(fm === 12 ? fy + 1 : fy, fm % 12, sd)
  }
  const thisYear = dayInMonth(fy, sm - 1, sd)
  return thisYear >= from ? thisYear : dayInMonth(fy + 1, sm - 1, sd)
}

/** 日付の差（`to - from`、日） */
export const daysBetween = (from: string, to: string) => Math.round(((dayWallMs(to) ?? 0) - (dayWallMs(from) ?? 0)) / DAY_MS)

export type DueSoon = { item: DueItem; date: string; daysLeft: number }

/** 今日の計画に出す期限: 次の日まで `notifyDays` 日以内のもの（当日は必ず）。近い順 */
export function duesSoon(items: readonly DueItem[], today: string): DueSoon[] {
  const out: DueSoon[] = []
  for (const item of items) {
    const date = nextDueDate(item, today)
    if (!date) continue
    const daysLeft = daysBetween(today, date)
    if (daysLeft <= item.notifyDays) out.push({ item, date, daysLeft })
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.item.title.localeCompare(b.item.title))
}

/** 通知で知らせるもの: 知らせ始める日（`notifyDays` 日前）と当日だけ（毎日は送らない） */
export function duesToNotify(items: readonly DueItem[], today: string): DueSoon[] {
  return duesSoon(items, today).filter((s) => s.daysLeft === 0 || s.daysLeft === s.item.notifyDays)
}

/** 朝のまとめを使っていない人に期限を知らせる時刻 */
export const DUES_DEFAULT_TIME = '08:00'

/** その日の期限の通知を送った印（`push_subscriptions.reminder_sent.keys`） */
export const duesSentKey = (date: string) => `dues|${date}`
