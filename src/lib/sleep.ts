import { addDays } from 'date-fns'
import type { Task } from '../types/task'
import { isActiveTask } from './taskLifecycle'
import { fromDateKey, toDateKey } from './dateKey'

/** 睡眠の記録が 1 件も無いときの初期値 */
export const DEFAULT_BED_TIME = '23:30'
export const DEFAULT_WAKE_TIME = '07:00'

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase()

/** 印が付く前に「睡眠」として付けていた記録のタイトル・ラベル（変換用） */
const SLEEP_WORDS = new Set(['睡眠', 'すいみん', '就寝', '寝る', 'ねる', 'sleep', 'sleeping'])

/** 睡眠の記録か。睡眠は記録の時間・分類の集計に入れず、タイムラインでも落ち着いた色で描く */
export function isSleepRecord(t: Task): boolean {
  return t.isTimeLog === true && t.isSleep === true
}

/** 印の無い古い記録のうち、タイトルかラベルが「睡眠」のもの */
export function looksLikeSleep(t: Task): boolean {
  if (!t.isTimeLog || t.isSleep) return false
  return SLEEP_WORDS.has(norm(t.title)) || (t.tags[0] !== undefined && SLEEP_WORDS.has(norm(t.tags[0])))
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** 起きた日（睡眠の終わりの日） */
export function wakeDateOf(t: Task): string | null {
  if (!t.dueDate || !t.startTime || !t.endTime) return null
  if (t.endDate) return t.endDate
  // endDate の無い古い記録は、終わりが始まりより前なら翌日まで
  if (toMin(t.endTime) <= toMin(t.startTime)) return toDateKey(addDays(fromDateKey(t.dueDate), 1))
  return t.dueDate
}

/** その日の朝に起きた睡眠（同じ日に複数あれば最後に起きたもの） */
export function sleepEndingOn(tasks: readonly Task[], wakeDateKey: string): Task | null {
  let best: Task | null = null
  for (const t of tasks) {
    if (!isSleepRecord(t) || !isActiveTask(t) || wakeDateOf(t) !== wakeDateKey) continue
    if (!best || (t.endTime ?? '') > (best.endTime ?? '')) best = t
  }
  return best
}

/** 入力欄の初期値: いちばん最近の睡眠の時刻（無ければ 23:30–7:00） */
export function defaultSleepTimes(tasks: readonly Task[]): { bed: string; wake: string } {
  let latest: Task | null = null
  let latestKey = ''
  for (const t of tasks) {
    if (!isSleepRecord(t) || !isActiveTask(t) || !t.startTime || !t.endTime) continue
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
  if (toMin(bed) > toMin(wake)) {
    return { dueDate: toDateKey(addDays(fromDateKey(wakeDateKey), -1)), endDate: wakeDateKey }
  }
  return { dueDate: wakeDateKey, endDate: null }
}

/** 寝ていた時間（分） */
export function sleepMinutes(bed: string, wake: string): number {
  const d = toMin(wake) - toMin(bed)
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
const noonOffset = (hhmm: string) => (toMin(hhmm) - 12 * 60 + DAY_MIN) % DAY_MIN
const offsetToClock = (off: number) => {
  const m = (Math.round(off) + 12 * 60) % DAY_MIN
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const spread = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/** `endDateKey` までの `days` 日ぶんの睡眠（統計画面用） */
export function summarizeSleep(tasks: readonly Task[], endDateKey: string, days = 14): SleepSummary {
  const end = fromDateKey(endDateKey)
  const nights: (SleepNight | null)[] = []
  for (let i = days - 1; i >= 0; i--) {
    const dateKey = toDateKey(addDays(end, -i))
    const r = sleepEndingOn(tasks, dateKey)
    if (!r?.startTime || !r.endTime || r.startTime === r.endTime) {
      nights.push(null)
      continue
    }
    nights.push({
      dateKey,
      bed: r.startTime,
      wake: r.endTime,
      minutes: sleepMinutes(r.startTime, r.endTime),
      bedOffset: noonOffset(r.startTime),
      wakeOffset: noonOffset(r.startTime) + sleepMinutes(r.startTime, r.endTime),
    })
  }
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
