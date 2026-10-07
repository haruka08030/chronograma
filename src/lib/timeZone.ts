import { pad2 } from './clockTime'

/**
 * タイムゾーン。アプリの日付・時刻（`yyyy-MM-dd` / `HH:mm`）はすべて「アプリのタイムゾーン」の壁時計で持つ。
 * 既定は端末のタイムゾーン。設定で別のタイムゾーンにすると、「今」「今日」と Google の予定の時刻がそちらに合わせて動く。
 *
 * 画面のコードは `new Date()` の代わりに `zonedNow()` を使う。返る Date はローカルの getter（getHours など）が
 * アプリのタイムゾーンの壁時計を返すようにずらしてある（瞬間としての値は使わない。保存する時刻は `new Date().toISOString()`）。
 */

let appZoneSetting: string | null = null

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** 設定のタイムゾーン（null は端末に合わせる）。ストアが読み込み時・変更時に呼ぶ */
export function setAppTimeZoneSetting(tz: string | null) {
  appZoneSetting = tz && isValidTimeZone(tz) ? tz : null
}

export function appTimeZone(): string {
  return appZoneSetting ?? deviceTimeZone()
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatters.set(tz, f)
  }
  return f
}

/** その瞬間の、そのタイムゾーンの壁時計を UTC の数値として（オフセット計算用） */
function wallAsUtcMs(tz: string, at: number): number {
  const p: Record<string, number> = {}
  for (const part of partsFormatter(tz).formatToParts(new Date(at))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value)
  }
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!)
}

/** その瞬間のタイムゾーンの UTC からのずれ（分、東が正。東京は 540） */
export function zoneOffsetMinutes(tz: string, at: number = Date.now()): number {
  const t = Math.floor(at / 1000) * 1000
  return Math.round((wallAsUtcMs(tz, t) - t) / 60_000)
}

/** 端末のローカル時刻で見たときにアプリのタイムゾーンの壁時計になるよう、瞬間に足す量（ミリ秒） */
function appShiftMs(at: number): number {
  const tz = appTimeZone()
  if (!appZoneSetting || tz === deviceTimeZone() || !Number.isFinite(at)) return 0
  return (zoneOffsetMinutes(tz, at) + new Date(at).getTimezoneOffset()) * 60_000
}

/** 今（getHours などがアプリのタイムゾーンの壁時計を返す Date） */
export function zonedNow(): Date {
  return toAppWall(Date.now())
}

/** 瞬間（ISO 文字列など）→ アプリのタイムゾーンの壁時計を表す Date */
export function toAppWall(instant: Date | string | number): Date {
  const ms = typeof instant === 'number' ? instant : new Date(instant).getTime()
  return new Date(ms + appShiftMs(ms))
}

/** `toAppWall` の逆。壁時計を表す Date → 本当の瞬間 */
export function fromAppWall(wall: Date): Date {
  const guess = wall.getTime() - appShiftMs(wall.getTime())
  return new Date(wall.getTime() - appShiftMs(guess))
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * アプリの「今日」（その日の 0:00 の壁時計）。日は 0 時で変わる。
 * 前の日に終わらなかった予定は今日のやり残し（`getDayPlan().carryOver`）に繰り越して出す
 */
export function appToday(): Date {
  const d = zonedNow()
  d.setHours(0, 0, 0, 0)
  return d
}

/** アプリの「今日」の `yyyy-MM-dd` */
export function appTodayKey(): string {
  return appDayKeyOf(Date.now())
}

/** 瞬間（完了した時刻など）がアプリのどの日か（`yyyy-MM-dd`） */
export function appDayKeyOf(instant: Date | string | number): string {
  const d = toAppWall(instant)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** date-fns の isToday / isTomorrow の、アプリのタイムゾーン版 */
export function isAppToday(d: Date): boolean {
  return sameDay(d, appToday())
}

export function isAppTomorrow(d: Date): boolean {
  const t = appToday()
  t.setDate(t.getDate() + 1)
  return sameDay(d, t)
}

/** 今の時刻がその日の中にあるか（現在の線・スクロール用） */
export function isNowOnDay(d: Date): boolean {
  return sameDay(d, zonedNow())
}

export function isAppPast(d: Date): boolean {
  return d.getTime() < zonedNow().getTime()
}

export interface WallClock {
  /** `yyyy-MM-dd` */
  date: string
  /** `HH:mm` */
  time: string
}

/** 瞬間 → そのタイムゾーンの日付と時刻 */
export function wallInZone(at: number, tz: string): WallClock {
  const d = new Date(wallAsUtcMs(tz, at))
  return {
    date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    time: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`,
  }
}

/** そのタイムゾーンの日付と時刻 → 瞬間（夏時間で存在しない時刻は前後に寄る） */
export function instantFromWall(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const asUtc = Date.UTC(y!, mo! - 1, d!, h!, mi!)
  let at = asUtc - zoneOffsetMinutes(tz, asUtc) * 60_000
  at = asUtc - zoneOffsetMinutes(tz, at) * 60_000
  return at
}

/** あるタイムゾーンの壁時計を、別のタイムゾーンの壁時計に */
export function convertWall(date: string, time: string, fromTz: string, toTz: string): WallClock {
  if (fromTz === toTz) return { date, time }
  return wallInZone(instantFromWall(date, time, fromTz), toTz)
}

/** `GMT+9` / `GMT-4` / `GMT+5:30` */
export function gmtLabel(tz: string, at: number = Date.now()): string {
  const off = zoneOffsetMinutes(tz, at)
  const sign = off < 0 ? '-' : '+'
  const abs = Math.abs(off)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `GMT${sign}${h}${m ? `:${pad2(m)}` : ''}`
}

/** `America/New_York` → `New York` */
export function zoneCityName(tz: string): string {
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ')
}

/** 言語に合わせた長い名前（例: `日本標準時` / `Eastern Time`）。取れなければ都市名 */
export function zoneLongName(tz: string, locale?: string, at: number = Date.now()): string {
  try {
    const name = new Intl.DateTimeFormat(locale ?? 'en-US', { timeZone: tz, timeZoneName: 'longGeneric' })
      .formatToParts(new Date(at))
      .find((p) => p.type === 'timeZoneName')?.value
    if (name && !/^GMT|^UTC[+-]/.test(name)) return name
  } catch {
    /* 下へ */
  }
  return zoneCityName(tz)
}

/** 選択肢の表示（例: `(GMT+9) 日本標準時 - Tokyo`）。同じ名前の地域が多いので都市名も付ける */
export function zoneOptionLabel(tz: string, locale?: string, at: number = Date.now()): string {
  const city = zoneCityName(tz)
  const long = zoneLongName(tz, locale, at)
  return `(${gmtLabel(tz, at)}) ${long}${long !== city ? ` - ${city}` : ''}`
}

const FALLBACK_ZONES = [
  'UTC',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Cairo',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
]

let zoneListCache: string[] | null = null

/** 選べるタイムゾーン（UTC からのずれ順） */
export function allTimeZones(): string[] {
  if (zoneListCache) return zoneListCache
  let zones: string[] = FALLBACK_ZONES
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone')
    if (supported && supported.length > 0) zones = supported.includes('UTC') ? supported : ['UTC', ...supported]
  } catch {
    /* 既定の一覧 */
  }
  const now = Date.now()
  zoneListCache = [...zones].sort((a, b) => zoneOffsetMinutes(a, now) - zoneOffsetMinutes(b, now) || a.localeCompare(b))
  return zoneListCache
}
