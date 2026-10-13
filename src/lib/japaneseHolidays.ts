/**
 * 日本の祝日（「国民の祝日に関する法律」）。振替休日・国民の休日を含む。
 *
 * Google の「日本の祝日」カレンダーは読まない（権限を広げない）ので、アプリの中で計算する。
 * 対象は 2000〜2099 年。法改正の年ごとの違い（ハッピーマンデー・昭和の日・山の日・天皇誕生日の移動、
 * 2019 年の即位の日・即位礼正殿の儀、2020・2021 年のオリンピックによる移動）も入れてある。
 * 春分・秋分の日は前年 2 月の官報で決まるので、ここでは天文計算の近似式で出す（1980〜2099 年で一致する式）。
 */

const FIRST_YEAR = 2000
const LAST_YEAR = 2099

/** 月日を `yyyy-MM-dd` に */
function key(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 曜日（0 = 日曜）。タイムゾーンに左右されないよう UTC で数える */
function weekday(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** その月の第 n 月曜日の日 */
function nthMonday(y: number, m: number, n: number): number {
  const first = weekday(y, m, 1)
  return 1 + ((8 - first) % 7) + (n - 1) * 7
}

/** 日付キーを n 日ずらす */
function shift(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return key(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

function weekdayOfKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number]
  return weekday(y, m, d)
}

/** 春分の日（3 月の日） */
export function vernalEquinoxDay(y: number): number {
  return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))
}

/** 秋分の日（9 月の日） */
export function autumnalEquinoxDay(y: number): number {
  return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))
}

/** 「国民の祝日」そのもの（振替休日・国民の休日を除く） */
function nationalHolidays(y: number): Map<string, string> {
  const out = new Map<string, string>()
  const add = (m: number, d: number, name: string) => out.set(key(y, m, d), name)

  add(1, 1, '元日')
  add(1, nthMonday(y, 1, 2), '成人の日')
  add(2, 11, '建国記念の日')
  if (y >= 2020) add(2, 23, '天皇誕生日')
  add(3, vernalEquinoxDay(y), '春分の日')
  add(4, 29, y >= 2007 ? '昭和の日' : 'みどりの日')
  if (y === 2019) add(5, 1, '天皇の即位の日')
  add(5, 3, '憲法記念日')
  if (y >= 2007) add(5, 4, 'みどりの日')
  add(5, 5, 'こどもの日')

  // 海の日・スポーツの日・山の日は 2020・2021 年だけオリンピックに合わせて動いた
  if (y === 2020) {
    add(7, 23, '海の日')
    add(7, 24, 'スポーツの日')
    add(8, 10, '山の日')
  } else if (y === 2021) {
    add(7, 22, '海の日')
    add(7, 23, 'スポーツの日')
    add(8, 8, '山の日')
  } else {
    add(7, y >= 2003 ? nthMonday(y, 7, 3) : 20, '海の日')
    if (y >= 2016) add(8, 11, '山の日')
    add(10, nthMonday(y, 10, 2), y >= 2020 ? 'スポーツの日' : '体育の日')
  }

  add(9, y >= 2003 ? nthMonday(y, 9, 3) : 15, '敬老の日')
  add(9, autumnalEquinoxDay(y), '秋分の日')
  if (y === 2019) add(10, 22, '即位礼正殿の儀')
  add(11, 3, '文化の日')
  add(11, 23, '勤労感謝の日')
  if (y <= 2018) add(12, 23, '天皇誕生日')
  return out
}

const cache = new Map<number, ReadonlyMap<string, string>>()

/** その年の祝日（日付キー → 名前、日付順）。2000〜2099 年以外は空 */
export function japaneseHolidaysOf(y: number): ReadonlyMap<string, string> {
  const hit = cache.get(y)
  if (hit) return hit
  if (y < FIRST_YEAR || y > LAST_YEAR) return new Map()

  const national = nationalHolidays(y)
  const all = new Map(national)

  // 振替休日: 祝日が日曜なら、その後のいちばん近い祝日でない日（2006 年までは翌日だけ）
  for (const day of national.keys()) {
    if (weekdayOfKey(day) !== 0) continue
    let next = shift(day, 1)
    if (y >= 2007) while (national.has(next)) next = shift(next, 1)
    if (!national.has(next)) all.set(next, '振替休日')
  }

  // 国民の休日: 前の日と次の日が「国民の祝日」で、その日は祝日でも振替休日でもない日（日曜は休みなので数えない）
  for (const day of national.keys()) {
    const between = shift(day, 1)
    if (national.has(shift(day, 2)) && !all.has(between) && weekdayOfKey(between) !== 0) all.set(between, '国民の休日')
  }

  const sorted = new Map([...all.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))
  cache.set(y, sorted)
  return sorted
}

/** その日の祝日の名前（祝日でなければ null） */
export function japaneseHolidayName(dateKey: string): string | null {
  const y = Number(dateKey.slice(0, 4))
  return japaneseHolidaysOf(y).get(dateKey) ?? null
}
