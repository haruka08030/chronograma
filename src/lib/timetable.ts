import { isEventTask, type Task } from '../types/task'
import { toMinutes } from './clockTime'
import { isoWeekday } from './recurrence'
import { fromDateKey } from './dateKey'
import { settingSyncStep } from './settingSync'

/**
 * 授業の時間割（#279）。設定は「時限」（1 限 9:00–10:30 …、学校ごとに違うので編集できる）と「学期の期間」。
 * 時間割の画面は 曜日 × 時限 のマスで、マスに授業を入れると、学期の間の毎週の予定（`eventSeries.ts`）ができる。
 * マスに何が入っているかは設定に持たず、予定の行（毎週の印のある予定）から出す（予定を直せば時間割も変わる）。
 * 端末間で同期する（`user_timetable`、`027`）
 */
export type TimetablePeriod = {
  /** `HH:mm` */
  start: string
  /** `HH:mm`（始まりより後） */
  end: string
}

export type Timetable = {
  periods: TimetablePeriod[]
  /** 学期の始まり（`yyyy-MM-dd`）。null は決めていない */
  termStart: string | null
  /** 学期の終わり（`yyyy-MM-dd`、この日まで）。null は決めていない */
  termEnd: string | null
  /** 祝日に授業を入れない（大学ごとに違うので既定は入れる） */
  skipHolidays: boolean
}

/** 時限の数の上限 */
export const TIMETABLE_PERIOD_MAX = 12
/** 時間割のマスの曜日（月〜土。1=月 … 6=土） */
export const TIMETABLE_WEEKDAYS = [1, 2, 3, 4, 5, 6] as const

/** 時限の既定（よくある 90 分・10 分休み・昼休み 50 分） */
export const DEFAULT_PERIODS: readonly TimetablePeriod[] = [
  { start: '09:00', end: '10:30' },
  { start: '10:40', end: '12:10' },
  { start: '13:00', end: '14:30' },
  { start: '14:40', end: '16:10' },
  { start: '16:20', end: '17:50' },
]

export const DEFAULT_TIMETABLE: Timetable = { periods: [...DEFAULT_PERIODS], termStart: null, termEnd: null, skipHolidays: false }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** 時限の時刻が使えるか（どちらも `HH:mm`、終わりが始まりより後） */
export function isValidPeriod(p: TimetablePeriod): boolean {
  return HHMM.test(p.start) && HHMM.test(p.end) && toMinutes(p.end)! > toMinutes(p.start)!
}

/** 保存・同期から読んだ値をそろえる。時限は使えるものだけ・始まり順・上限まで。学期は始まり ≤ 終わりのときだけ */
export function normalizeTimetable(raw: unknown): Timetable {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TIMETABLE, periods: [...DEFAULT_PERIODS] }
  const x = raw as Record<string, unknown>
  const periods = Array.isArray(x.periods)
    ? x.periods
        .filter((p): p is TimetablePeriod => !!p && typeof p === 'object' && typeof p.start === 'string' && typeof p.end === 'string')
        .map((p) => ({ start: p.start, end: p.end }))
        .filter(isValidPeriod)
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(0, TIMETABLE_PERIOD_MAX)
    : [...DEFAULT_PERIODS]
  const termStart = typeof x.termStart === 'string' && DATE_KEY.test(x.termStart) ? x.termStart : null
  const termEnd = typeof x.termEnd === 'string' && DATE_KEY.test(x.termEnd) ? x.termEnd : null
  const termOk = !termStart || !termEnd || termStart <= termEnd
  return {
    periods,
    termStart: termOk ? termStart : null,
    termEnd: termOk ? termEnd : null,
    skipHolidays: x.skipHolidays === true,
  }
}

/**
 * 学期を決めていないときの案（日本の大学の前期 4/1–7/31・後期 10/1–1/31）。3〜8 月は前期、9〜2 月は後期
 */
export function suggestTerm(today: string): { termStart: string; termEnd: string } {
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7))
  if (m >= 3 && m <= 8) return { termStart: `${y}-04-01`, termEnd: `${y}-07-31` }
  const fallYear = m >= 9 ? y : y - 1
  return { termStart: `${fallYear}-10-01`, termEnd: `${fallYear + 1}-01-31` }
}

/** 授業を入れ始める日（学期の始まりと今日の遅いほう。過ぎた回は作らない） */
export function classStartDate(timetable: Pick<Timetable, 'termStart'>, today: string): string {
  return timetable.termStart && timetable.termStart > today ? timetable.termStart : today
}

/** その時刻が入る時限（始まり ≤ 時刻 < 終わり）。無ければ -1 */
export function periodIndexOf(periods: readonly TimetablePeriod[], time: string | null): number {
  if (!time) return -1
  return periods.findIndex((p) => p.start <= time && time < p.end)
}

/** 時間割のマスに入っている授業 */
export type TimetableClass = {
  seriesId: string
  title: string
  color: string | null
  startTime: string
  endTime: string
  weekday: number
  period: number
  /** 学期の間に残っている回の数 */
  count: number
  /** その中でいちばん早い回の id（直す・消すのはこの回から後） */
  firstTaskId: string
}

/** マスの鍵（`曜日:時限`） */
export const cellKey = (weekday: number, period: number) => `${weekday}:${period}`

/**
 * 時間割のマスの中身。学期の間（今日より前は除く）の毎週の予定を、曜日と始まりの時刻の時限で並べる。
 * 同じマスに 2 つあれば先に始まる回のもの。どの時限にも入らない時刻の授業はマスに出さない
 */
export function timetableClasses(tasks: readonly Task[], timetable: Timetable, today: string): Map<string, TimetableClass> {
  const from = classStartDate(timetable, today)
  const to = timetable.termEnd
  const bySeriesDay = new Map<string, TimetableClass>()
  const rows = tasks
    .filter(
      (t) =>
        isEventTask(t) &&
        !!t.series &&
        !t.deletedAt &&
        !!t.scheduledDate &&
        !!t.startTime &&
        !!t.endTime &&
        t.scheduledDate >= from &&
        (!to || t.scheduledDate <= to),
    )
    .sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!))
  for (const t of rows) {
    const weekday = isoWeekday(fromDateKey(t.scheduledDate!))
    const key = `${t.series!.id}:${weekday}`
    const hit = bySeriesDay.get(key)
    if (hit) {
      hit.count++
      continue
    }
    const period = periodIndexOf(timetable.periods, t.startTime)
    if (period < 0) continue
    bySeriesDay.set(key, {
      seriesId: t.series!.id,
      title: t.title,
      color: t.color,
      startTime: t.startTime!,
      endTime: t.endTime!,
      weekday,
      period,
      count: 1,
      firstTaskId: t.id,
    })
  }
  const out = new Map<string, TimetableClass>()
  for (const c of [...bySeriesDay.values()].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    const key = cellKey(c.weekday, c.period)
    if (!out.has(key)) out.set(key, c)
  }
  return out
}

/**
 * 時間割の設定の同期。サーバーには利用者ごとに 1 行（`user_timetable`、`027`）。全体を 1 つの値として扱い、
 * 手元とサーバーのどちらか新しいほうに合わせる（この端末でまだ一度も合わせていなければサーバーのものに）
 */
export type LocalTimetable = { timetable: Timetable; updatedAt: string | null; syncedAt?: string | null }
export type RemoteTimetable = { timetable: Timetable; updatedAt: string }
export type TimetableSyncPlan = {
  apply?: { timetable: Timetable; updatedAt: string }
  push?: RemoteTimetable & { base: string | null }
  adopt?: string
}

export const sameTimetable = (a: Timetable, b: Timetable) => JSON.stringify(a) === JSON.stringify(b)

export function planTimetableSync(
  local: LocalTimetable,
  remote: RemoteTimetable | null,
  nowIso: string = new Date().toISOString(),
  clockOffsetMs = 0,
): TimetableSyncPlan {
  if (!remote) {
    // 一度も変えていない既定の値は送らない（ほかの端末で決めた時間割を既定で上書きしない）
    if (local.updatedAt === null) return {}
    return { push: { timetable: local.timetable, updatedAt: local.updatedAt, base: null } }
  }
  const remoteValue = normalizeTimetable(remote.timetable)
  const step = settingSyncStep(
    { updatedAt: local.updatedAt, syncedAt: local.syncedAt ?? null },
    remote,
    sameTimetable(local.timetable, remoteValue),
    clockOffsetMs,
  )
  switch (step.kind) {
    case 'initial':
    case 'apply':
      return { apply: { timetable: remoteValue, updatedAt: remote.updatedAt } }
    case 'push':
      return { push: { timetable: local.timetable, updatedAt: local.updatedAt ?? nowIso, base: step.base } }
    case 'adopt':
      return { adopt: remote.updatedAt }
    default:
      return {}
  }
}
