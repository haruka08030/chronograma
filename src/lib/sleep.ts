import { addDays, addMonths, differenceInCalendarDays, getDay, startOfMonth, startOfWeek } from 'date-fns'
import { isSleepTask, type Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { fromDateKey, toDateKey } from './dateKey'
import { minutesToTime, timeToMinutes } from './clockTime'
import type { SleepPrefs } from './sleepPrefs'

/** 睡眠の記録が 1 件も無いときの初期値 */
export const DEFAULT_BED_TIME = '23:30'
export const DEFAULT_WAKE_TIME = '07:00'

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase()

/** 睡眠とみなす記録のタイトル・ラベル（後から記録・前の版のデータの変換） */
const SLEEP_WORDS = new Set(['睡眠', 'すいみん', '就寝', '寝る', 'ねる', 'sleep', 'sleeping'])

/** 睡眠の印の無い記録のうち、タイトルかラベルが「睡眠」のもの（後から記録・前の版のデータの変換。▶ の記録・習慣のチェックには使わない） */
export function looksLikeSleep(t: Task): boolean {
  if (t.kind !== 'log') return false
  return SLEEP_WORDS.has(norm(t.title)) || (Boolean(t.category ?? t.tags[0]) && SLEEP_WORDS.has(norm((t.category ?? t.tags[0])!)))
}

/** 起きた日（睡眠の終わりの日） */
export function wakeDateOf(t: Task): string | null {
  if (!t.dueDate || !t.startTime || !t.endTime) return null
  if (t.endDate) return t.endDate
  // endDate の無い古い記録は、終わりが始まりより前なら翌日まで
  if (timeToMinutes(t.endTime) <= timeToMinutes(t.startTime)) return toDateKey(addDays(fromDateKey(t.dueDate), 1))
  return t.dueDate
}

/** その日の朝に起きた睡眠（同じ日に複数あれば最後に起きたもの） */
export function sleepEndingOn(tasks: readonly Task[], wakeDateKey: string): Task | null {
  let best: Task | null = null
  for (const t of tasks) {
    if (!isSleepTask(t) || !isActiveTask(t) || wakeDateOf(t) !== wakeDateKey) continue
    if (!best || (t.endTime ?? '') > (best.endTime ?? '')) best = t
  }
  return best
}

/** 入力欄の初期値: いつもの時刻（睡眠のページで決めたもの）、無ければいちばん最近の睡眠の時刻（それも無ければ 23:30–7:00） */
export function defaultSleepTimes(
  tasks: readonly Task[],
  prefs?: Pick<SleepPrefs, 'usualBed' | 'usualWake'>,
): { bed: string; wake: string } {
  if (prefs?.usualBed && prefs.usualWake) return { bed: prefs.usualBed, wake: prefs.usualWake }
  let latest: Task | null = null
  let latestKey = ''
  for (const t of tasks) {
    if (!isSleepTask(t) || !isActiveTask(t) || !t.startTime || !t.endTime) continue
    const key = `${wakeDateOf(t) ?? ''} ${t.endTime}`
    if (key > latestKey) {
      latest = t
      latestKey = key
    }
  }
  return latest ? { bed: latest.startTime!, wake: latest.endTime! } : { bed: DEFAULT_BED_TIME, wake: DEFAULT_WAKE_TIME }
}

/**
 * 「何時に寝て、何時に起きたか」を記録の日付に直す。
 * 寝た時刻が起きた時刻より後なら前日の夜に寝た（23:30 → 7:00）、前なら同じ日（1:00 → 8:00）
 */
export function sleepSpan(wakeDateKey: string, bed: string, wake: string): { dueDate: string; endDate: string | null } {
  if (timeToMinutes(bed) > timeToMinutes(wake)) {
    return { dueDate: toDateKey(addDays(fromDateKey(wakeDateKey), -1)), endDate: wakeDateKey }
  }
  return { dueDate: wakeDateKey, endDate: null }
}

/** 寝ていた時間（分） */
export function sleepMinutes(bed: string, wake: string): number {
  const d = timeToMinutes(wake) - timeToMinutes(bed)
  return d > 0 ? d : d + 24 * 60
}

export interface SleepNight {
  /** 起きた日 */
  dateKey: string
  bed: string
  wake: string
  minutes: number
  /** 前日 12:00 からの分（寝た・起きた）。日をまたいでも大小で比べられる */
  bedOffset: number
  wakeOffset: number
}

export interface SleepSummary {
  /** 古い順。記録の無い日は null */
  nights: (SleepNight | null)[]
  /** 記録のある日数 */
  count: number
  avgMinutes: number | null
  avgBed: string | null
  avgWake: string | null
  /** 寝た・起きた時刻のばらつき（標準偏差、分） */
  bedSpread: number | null
  wakeSpread: number | null
}

const DAY_MIN = 24 * 60
/** 前日 12:00 起点の分。23:30 → 690、7:00 → 1140 */
const noonOffset = (hhmm: string) => (timeToMinutes(hhmm) - 12 * 60 + DAY_MIN) % DAY_MIN
const offsetToClock = (off: number) => {
  const m = (Math.round(off) + 12 * 60) % DAY_MIN
  return minutesToTime(m)
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const spread = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/** その日の朝に起きた睡眠を 1 晩分に（記録が無い・寝た時刻と起きた時刻が同じなら null） */
export function sleepNightOn(tasks: readonly Task[], dateKey: string): SleepNight | null {
  const r = sleepEndingOn(tasks, dateKey)
  if (!r?.startTime || !r.endTime || r.startTime === r.endTime) return null
  const minutes = sleepMinutes(r.startTime, r.endTime)
  return {
    dateKey,
    bed: r.startTime,
    wake: r.endTime,
    minutes,
    bedOffset: noonOffset(r.startTime),
    wakeOffset: noonOffset(r.startTime) + minutes,
  }
}

function summarizeNights(nights: (SleepNight | null)[]): SleepSummary {
  const got = nights.filter((n): n is SleepNight => n !== null)
  if (got.length === 0) {
    return { nights, count: 0, avgMinutes: null, avgBed: null, avgWake: null, bedSpread: null, wakeSpread: null }
  }
  const beds = got.map((n) => n.bedOffset)
  const wakes = got.map((n) => n.wakeOffset)
  return {
    nights,
    count: got.length,
    avgMinutes: Math.round(mean(got.map((n) => n.minutes))),
    avgBed: offsetToClock(mean(beds)),
    avgWake: offsetToClock(mean(wakes)),
    bedSpread: Math.round(spread(beds)),
    wakeSpread: Math.round(spread(wakes)),
  }
}

/** `startKey`〜`endKey`（起きた日、両端を含む）の睡眠 */
export function summarizeSleepBetween(tasks: readonly Task[], startKey: string, endKey: string): SleepSummary {
  const start = fromDateKey(startKey)
  const days = differenceInCalendarDays(fromDateKey(endKey), start) + 1
  const nights: (SleepNight | null)[] = []
  for (let i = 0; i < days; i++) nights.push(sleepNightOn(tasks, toDateKey(addDays(start, i))))
  return summarizeNights(nights)
}

/** `endDateKey` までの `days` 日ぶんの睡眠（統計画面用） */
export function summarizeSleep(tasks: readonly Task[], endDateKey: string, days = 14): SleepSummary {
  return summarizeSleepBetween(tasks, toDateKey(addDays(fromDateKey(endDateKey), -(days - 1))), endDateKey)
}

export interface SleepPeriod {
  kind: 'week' | 'month'
  /** 新しい順の何番目か（0 = 今週・今月） */
  ago: number
  startKey: string
  /** 今週・今月は今日まで */
  endKey: string
  summary: SleepSummary
}

/**
 * 週（月曜はじまり。統計の週の集計と同じ）と月ごとの睡眠の平均。新しい順に `weeks` 週・`months` か月。
 * 今週・今月は今日まで。記録の無い期間も行として返す（画面で「記録なし」）
 */
export function sleepPeriods(tasks: readonly Task[], todayKey: string, weeks = 4, months = 3): SleepPeriod[] {
  const today = fromDateKey(todayKey)
  const out: SleepPeriod[] = []
  const thisWeek = startOfWeek(today, { weekStartsOn: 1 })
  for (let i = 0; i < weeks; i++) {
    const start = addDays(thisWeek, -7 * i)
    const end = i === 0 ? today : addDays(start, 6)
    out.push({
      kind: 'week',
      ago: i,
      startKey: toDateKey(start),
      endKey: toDateKey(end),
      summary: summarizeSleepBetween(tasks, toDateKey(start), toDateKey(end)),
    })
  }
  const thisMonth = startOfMonth(today)
  for (let i = 0; i < months; i++) {
    const start = addMonths(thisMonth, -i)
    const end = i === 0 ? today : addDays(addMonths(start, 1), -1)
    out.push({
      kind: 'month',
      ago: i,
      startKey: toDateKey(start),
      endKey: toDateKey(end),
      summary: summarizeSleepBetween(tasks, toDateKey(start), toDateKey(end)),
    })
  }
  return out
}

/** 平日と土日の差を出すのに要る、それぞれの夜の数 */
export const WEEKEND_GAP_MIN_NIGHTS = 2

export interface WeekendGap {
  weekday: SleepSummary
  weekend: SleepSummary
  /** 土日の平均が平日よりどれだけ遅いか（分。早ければ負） */
  bedLater: number
  wakeLater: number
}

/**
 * 起きた日が土日の夜と平日の夜の、寝た・起きた時刻の平均の差（`endDateKey` までの `days` 日）。
 * 祝日は見ない。どちらかの夜が `WEEKEND_GAP_MIN_NIGHTS` に足りなければ null
 */
export function weekendGap(tasks: readonly Task[], endDateKey: string, days = 28): WeekendGap | null {
  const all = summarizeSleep(tasks, endDateKey, days).nights.filter((n): n is SleepNight => n !== null)
  const isWeekend = (n: SleepNight) => {
    const d = getDay(fromDateKey(n.dateKey))
    return d === 0 || d === 6
  }
  const weekday = summarizeNights(all.filter((n) => !isWeekend(n)))
  const weekend = summarizeNights(all.filter(isWeekend))
  if (weekday.count < WEEKEND_GAP_MIN_NIGHTS || weekend.count < WEEKEND_GAP_MIN_NIGHTS) return null
  const avg = (s: SleepSummary, k: 'bedOffset' | 'wakeOffset') => mean(s.nights.map((n) => n![k]))
  return {
    weekday,
    weekend,
    bedLater: Math.round(avg(weekend, 'bedOffset') - avg(weekday, 'bedOffset')),
    wakeLater: Math.round(avg(weekend, 'wakeOffset') - avg(weekday, 'wakeOffset')),
  }
}
