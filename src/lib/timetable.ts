import { isEventTask, type Task } from '../types/task'
import { toMinutes } from './clockTime'
import { isoWeekday } from './recurrence'
import { fromDateKey } from './dateKey'
import { merge3, merge3Record, merge3Set, type Side } from './settingMerge'
import { courseKey } from './courseLinks'
import type { DateTone } from '../components/ui/dueTone'
import type { Attendance } from './absenceCourses'

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
  /** 欠席した日（#452）。授業名（`courseKey`）→ `yyyy-MM-dd` の並び（古い順）。同じ名前の授業は週に何回あっても合わせて数える */
  absences: Record<string, string[]>
  /** 休める回数（授業名（`courseKey`）→ 回数）。無ければ学期の回数の 1/3（`classAttendance`） */
  absenceLimits: Record<string, number>
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

export const DEFAULT_TIMETABLE: Timetable = {
  periods: [...DEFAULT_PERIODS],
  termStart: null,
  termEnd: null,
  skipHolidays: false,
  absences: {},
  absenceLimits: {},
}

/** 欠席を覚えておける授業の数・1 つの授業の欠席の数・休める回数の上限（`user_timetable` の大きさの上限 16KB に収まる数） */
export const ABSENCE_CLASS_MAX = 60
export const ABSENCE_DATES_MAX = 40
export const ABSENCE_LIMIT_MAX = 99

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** 時限の時刻が使えるか（どちらも `HH:mm`、終わりが始まりより後） */
export function isValidPeriod(p: TimetablePeriod): boolean {
  return HHMM.test(p.start) && HHMM.test(p.end) && toMinutes(p.end)! > toMinutes(p.start)!
}

/** 保存・同期から読んだ値をそろえる。時限は使えるものだけ・始まり順・上限まで。学期は始まり ≤ 終わりのときだけ */
export function normalizeTimetable(raw: unknown): Timetable {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TIMETABLE, periods: [...DEFAULT_PERIODS], absences: {}, absenceLimits: {} }
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
  const term = { termStart: termOk ? termStart : null, termEnd: termOk ? termEnd : null }
  return {
    periods,
    ...term,
    skipHolidays: x.skipHolidays === true,
    absences: normalizeAbsences(x.absences, term),
    absenceLimits: normalizeAbsenceLimits(x.absenceLimits),
  }
}

export const inTerm = (date: string, term: Pick<Timetable, 'termStart' | 'termEnd'>) =>
  (!term.termStart || date >= term.termStart) && (!term.termEnd || date <= term.termEnd)

/** 欠席の日付。名前は `courseKey` に、日付は学期の中のものだけを古い順に（前の学期の分は落とす） */
function normalizeAbsences(raw: unknown, term: Pick<Timetable, 'termStart' | 'termEnd'>): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string[]> = {}
  for (const [name, dates] of Object.entries(raw as Record<string, unknown>)) {
    const key = courseKey(name)
    if (!key || !Array.isArray(dates)) continue
    const merged = new Set(out[key] ?? [])
    for (const d of dates) if (typeof d === 'string' && DATE_KEY.test(d) && inTerm(d, term)) merged.add(d)
    if (merged.size === 0) continue
    if (!out[key] && Object.keys(out).length >= ABSENCE_CLASS_MAX) break
    out[key] = [...merged].sort().slice(-ABSENCE_DATES_MAX)
  }
  return out
}

function normalizeAbsenceLimits(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, number> = {}
  for (const [name, n] of Object.entries(raw as Record<string, unknown>)) {
    const key = courseKey(name)
    if (!key || typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > ABSENCE_LIMIT_MAX) continue
    if (!(key in out) && Object.keys(out).length >= ABSENCE_CLASS_MAX) break
    out[key] = n
  }
  return out
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
export function classStartDate(term: { termStart: string | null }, today: string): string {
  return term.termStart && term.termStart > today ? term.termStart : today
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
export function timetableClasses(
  tasks: readonly Task[],
  periods: readonly TimetablePeriod[],
  term: { termStart: string | null; termEnd: string | null },
  today: string,
): Map<string, TimetableClass> {
  const from = classStartDate(term, today)
  const to = term.termEnd
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
    const period = periodIndexOf(periods, t.startTime)
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

/** 「欠席 2 / 5 回」と、残りが少ないときの一言（あと 1 回 / もう休めません / N 回超えています） */
export function attendanceText(a: Attendance, t: (key: string, opts?: Record<string, unknown>) => string): string {
  // 休める回数を決めていない一覧の授業（#503）は回数だけ
  if (a.limit === null || a.remaining === null) return t('timetable.attendanceCount', { count: a.absent })
  const base = t('timetable.attendance', { absent: a.absent, limit: a.limit })
  if (a.remaining === 1) return `${base} · ${t('timetable.attendanceLast')}`
  if (a.remaining === 0) return `${base} · ${t('timetable.attendanceNone')}`
  if (a.remaining < 0) return `${base} · ${t('timetable.attendanceOver', { count: -a.remaining })}`
  return base
}

/** 残りの回数の色の段階（締切と同じ: 0 回・超えたら赤、あと 1 回はオレンジ） */
export function attendanceTone(a: Pick<Attendance, 'remaining'>): DateTone {
  if (a.remaining === null) return 'future'
  if (a.remaining <= 0) return 'overdue'
  if (a.remaining === 1) return 'today'
  return 'future'
}

/**
 * 時間割の設定の同期。サーバーには利用者ごとに 1 行（`user_timetable`、`027`）。
 * 片方の端末だけが変えていればその側に、この端末でまだ一度も合わせていなければサーバーのものに合わせる。
 * 両方の端末で前回合わせた後に変えていたら、丸ごと新しいほうにせず中身ごとに合わせる（`mergeTimetables`）
 */
export type LocalTimetable = { timetable: Timetable; updatedAt: string | null; syncedAt?: string | null }
export type RemoteTimetable = { timetable: Timetable; updatedAt: string }
export type TimetableSyncPlan = {
  apply?: { timetable: Timetable; updatedAt: string }
  push?: RemoteTimetable & { base: string | null }
  adopt?: string
  /** 中身ごとに合わせたとき、両方が別の値に変えて新しいほうにした数 */
  conflicts?: number
}

/**
 * 両方の端末で変えた時間割を中身ごとに合わせる（`base` は前回合わせた版。無ければ両方にあるものを残す）。
 * 欠席は授業ごとの日付の集合（2 台で別々の授業・別々の日に足した欠席をどちらも残す）、休める回数は授業ごと、
 * 時限・学期・祝日は項目ごと。両方が別の値に変えた項目だけ `prefer` の側（新しいほう）
 */
export function mergeTimetables(base: Timetable | null, l: Timetable, r: Timetable, prefer: Side, onConflict?: () => void): Timetable {
  // 時限・学期・祝日はどちらにも必ずある（無いのは控えだけ）ので、合わせた値も必ずある
  const field = <K extends keyof Timetable>(k: K) => merge3(base?.[k], l[k], r[k], prefer, onConflict) as Timetable[K]
  const absences = merge3Record(base?.absences ?? null, l.absences, r.absences, prefer, onConflict, (b, lv, rv, baseKnown) => {
    const dates = merge3Set(baseKnown ? (b ?? []) : null, lv ?? [], rv ?? [], prefer)
    return dates.length > 0 ? dates : undefined
  })
  return normalizeTimetable({
    periods: field('periods'),
    termStart: field('termStart'),
    termEnd: field('termEnd'),
    skipHolidays: field('skipHolidays'),
    absences,
    absenceLimits: merge3Record(base?.absenceLimits ?? null, l.absenceLimits, r.absenceLimits, prefer, onConflict),
  })
}

export const sameTimetable = (a: Timetable, b: Timetable) => JSON.stringify(a) === JSON.stringify(b)
