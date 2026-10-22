import { minutesToTime, pad2, timeToMinutes } from './clockTime'

/**
 * 壁時計（アプリのタイムゾーンの `yyyy-MM-dd` と `HH:mm`）を、端末の Date を通さずに数える。
 * 記録・予定の時刻は壁時計なので、長さや日の中の位置は「日の通し番号 × 1440 + 0 時からの分」で数える。
 * 端末の Date にすると、端末の夏時間が切り替わる日（23 時間・25 時間）に 1 時間ずれる
 */

const DAY_MINUTES = 24 * 60
const DAY_MS = 86_400_000

/** 壁時計の区間（通しの分。end は含まない） */
export type WallInterval = { start: number; end: number }

/** `yyyy-MM-dd` → 1970-01-01 からの日数（暦だけで数える） */
export function dayIndexOf(dateKey: string): number {
  const [y, mo, d] = dateKey.split('-').map(Number)
  return Math.round(Date.UTC(y!, mo! - 1, d!) / DAY_MS)
}

/** 日数 → `yyyy-MM-dd` */
export function dateKeyOfDayIndex(index: number): string {
  const d = new Date(index * DAY_MS)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** `yyyy-MM-dd` + `HH:mm` → 通しの分（'24:00' は次の日の 0:00） */
export function wallMinutes(dateKey: string, hm: string): number {
  return dayIndexOf(dateKey) * DAY_MINUTES + timeToMinutes(hm)
}

/** 壁時計を表す Date（`zonedNow()` など。getter が壁時計を返す）→ 通しの分（秒は切り捨て） */
export function wallMinutesOf(d: Date): number {
  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  return wallMinutes(key, `${pad2(d.getHours())}:${pad2(d.getMinutes())}`)
}

/** 通しの分 → 日付と時刻（`HH:mm`、0:00〜23:59） */
export function wallParts(minutes: number): { date: string; time: string } {
  const day = Math.floor(minutes / DAY_MINUTES)
  return { date: dateKeyOfDayIndex(day), time: minutesToTime(minutes - day * DAY_MINUTES) }
}

/** 通しの分の日付が何日離れているか（暦の日数） */
export function wallDayDiff(later: number, earlier: number): number {
  return Math.floor(later / DAY_MINUTES) - Math.floor(earlier / DAY_MINUTES)
}

/** 区間のうち、その日（0:00〜翌 0:00）にかかる部分を、その日の 0 時からの分で（終わりは最大 1440）。かからなければ null */
export function wallSegmentOnDay(iv: WallInterval, dateKey: string): { startMin: number; endMin: number } | null {
  const d0 = dayIndexOf(dateKey) * DAY_MINUTES
  const startMin = Math.max(iv.start, d0) - d0
  const endMin = Math.min(iv.end, d0 + DAY_MINUTES) - d0
  return endMin > startMin ? { startMin, endMin } : null
}
