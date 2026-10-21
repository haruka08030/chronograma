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

/**
 * 保存・同期・バックアップから読んだタイムゾーン名。知らない名前（別の端末の新しいブラウザにしか無い名前・壊れた値）は null
 * （そのまま使うと Intl が RangeError を投げ、同期や詳細が毎回落ちる）
 */
export function readTimeZone(v: unknown): string | null {
  return typeof v === 'string' && v !== '' && isValidTimeZone(v) ? v : null
}

/** 設定のタイムゾーン（null は端末に合わせる）。ストアが読み込み時・変更時に呼ぶ */
export function setAppTimeZoneSetting(tz: string | null) {
  appZoneSetting = tz && isValidTimeZone(tz) ? tz : null
}

export function appTimeZone(): string {
  return appZoneSetting ?? deviceTimeZone()
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()
function makePartsFormatter(tz: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
/** 作れなかった（知らない）タイムゾーン名 */
const unknownZones = new Set<string>()
/** 知らないタイムゾーン名はアプリのタイムゾーン（それも使えなければ UTC）として扱う。投げない */
function partsFormatter(tz: string): Intl.DateTimeFormat {
  const cached = partsFormatters.get(tz)
  if (cached) return cached
  if (!unknownZones.has(tz)) {
    try {
      const f = makePartsFormatter(tz)
      partsFormatters.set(tz, f)
      return f
    } catch {
      unknownZones.add(tz)
    }
  }
  // アプリのタイムゾーンは設定で変わるので、置き換え先は覚えない
  const fallback = appTimeZone()
  return fallback !== tz && !unknownZones.has(fallback) ? partsFormatter(fallback) : partsFormatter('UTC')
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

/** アプリのタイムゾーンが端末と違うか（同じなら瞬間をそのまま使う） */
function needsShift(): boolean {
  return appZoneSetting !== null && appZoneSetting !== deviceTimeZone()
}

/** 今（getHours などがアプリのタイムゾーンの壁時計を返す Date） */
export function zonedNow(): Date {
  return toAppWall(Date.now())
}

/** 壁時計の数字 [年, 月(0〜), 日, 時, 分, 秒, ミリ秒] */
type WallFields = [number, number, number, number, number, number, number]

function localFields(d: Date): WallFields {
  return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]
}

/**
 * アプリのタイムゾーンの壁時計を表す Date。瞬間としての値（getTime）はふつうの Date と同じく、壁時計の数字を
 * 端末のローカルに組んだもの（`fromDateKey` などで作った Date とそのまま比べられる）。
 * 端末の夏時間の始まりの 1 時間は端末に存在しない時刻なので、そのときだけ壁時計の数字を別に持ち、
 * ローカルの getter（getHours など）と setter はその数字で動く。date-fns は `new date.constructor(date)` で
 * 写すので、写した先も同じ数字を持つ
 */
class AppWallDate extends Date {
  #wall: WallFields | null = null

  constructor(value: number | string | Date) {
    super(value instanceof Date ? value.getTime() : value)
    if (value instanceof AppWallDate) this.#wall = value.#wall
  }

  /** 壁時計の数字に合わせる。端末に存在しない時刻なら数字を別に持つ */
  setWall(f: WallFields): this {
    super.setTime(new Date(...f).getTime())
    const actual = localFields(this)
    this.#wall = actual.every((v, i) => v === f[i]) ? null : f
    return this
  }

  /** 存在しない時刻を持っているとき、壁時計の数字の上で setter を当てる */
  #edit(apply: (utc: Date) => void): number {
    const utc = new Date(Date.UTC(...this.#wall!))
    apply(utc)
    this.setWall([
      utc.getUTCFullYear(),
      utc.getUTCMonth(),
      utc.getUTCDate(),
      utc.getUTCHours(),
      utc.getUTCMinutes(),
      utc.getUTCSeconds(),
      utc.getUTCMilliseconds(),
    ])
    return this.getTime()
  }

  override getFullYear() {
    return this.#wall ? this.#wall[0] : super.getFullYear()
  }
  override getMonth() {
    return this.#wall ? this.#wall[1] : super.getMonth()
  }
  override getDate() {
    return this.#wall ? this.#wall[2] : super.getDate()
  }
  override getDay() {
    return this.#wall ? new Date(Date.UTC(...this.#wall)).getUTCDay() : super.getDay()
  }
  override getHours() {
    return this.#wall ? this.#wall[3] : super.getHours()
  }
  override getMinutes() {
    return this.#wall ? this.#wall[4] : super.getMinutes()
  }
  override getSeconds() {
    return this.#wall ? this.#wall[5] : super.getSeconds()
  }
  override getMilliseconds() {
    return this.#wall ? this.#wall[6] : super.getMilliseconds()
  }

  override setTime(time: number) {
    this.#wall = null
    return super.setTime(time)
  }
  override setFullYear(...a: Parameters<Date['setFullYear']>) {
    return this.#wall ? this.#edit((u) => u.setUTCFullYear(...a)) : super.setFullYear(...a)
  }
  override setMonth(...a: Parameters<Date['setMonth']>) {
    return this.#wall ? this.#edit((u) => u.setUTCMonth(...a)) : super.setMonth(...a)
  }
  override setDate(...a: Parameters<Date['setDate']>) {
    return this.#wall ? this.#edit((u) => u.setUTCDate(...a)) : super.setDate(...a)
  }
  override setHours(...a: Parameters<Date['setHours']>) {
    return this.#wall ? this.#edit((u) => u.setUTCHours(...a)) : super.setHours(...a)
  }
  override setMinutes(...a: Parameters<Date['setMinutes']>) {
    return this.#wall ? this.#edit((u) => u.setUTCMinutes(...a)) : super.setMinutes(...a)
  }
  override setSeconds(...a: Parameters<Date['setSeconds']>) {
    return this.#wall ? this.#edit((u) => u.setUTCSeconds(...a)) : super.setSeconds(...a)
  }
  override setMilliseconds(...a: Parameters<Date['setMilliseconds']>) {
    return this.#wall ? this.#edit((u) => u.setUTCMilliseconds(...a)) : super.setMilliseconds(...a)
  }
}

/**
 * 瞬間（ISO 文字列など）→ アプリのタイムゾーンの壁時計を表す Date。
 * 壁時計の数字（年月日時分秒）をそのまま端末のローカルの Date に組む。瞬間に一定の量を足す形だと、
 * 足した先で端末の夏時間が切り替わると 1 時間ずれていた。端末で存在しない時刻は `AppWallDate` が数字を持つ
 */
export function toAppWall(instant: Date | string | number): Date {
  const ms = typeof instant === 'number' ? instant : new Date(instant).getTime()
  if (!needsShift() || !Number.isFinite(ms)) return new Date(ms)
  const u = new Date(wallAsUtcMs(appTimeZone(), ms))
  const millis = ((ms % 1000) + 1000) % 1000
  return new AppWallDate(0).setWall([
    u.getUTCFullYear(),
    u.getUTCMonth(),
    u.getUTCDate(),
    u.getUTCHours(),
    u.getUTCMinutes(),
    u.getUTCSeconds(),
    millis,
  ])
}

/** `toAppWall` の逆。壁時計を表す Date → 本当の瞬間 */
export function fromAppWall(wall: Date): Date {
  if (!needsShift() || !Number.isFinite(wall.getTime())) return new Date(wall.getTime())
  const tz = appTimeZone()
  const asUtc = Date.UTC(
    wall.getFullYear(),
    wall.getMonth(),
    wall.getDate(),
    wall.getHours(),
    wall.getMinutes(),
    wall.getSeconds(),
    wall.getMilliseconds(),
  )
  let at = asUtc - zoneOffsetMinutes(tz, asUtc) * 60_000
  at = asUtc - zoneOffsetMinutes(tz, at) * 60_000
  return new Date(at)
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
