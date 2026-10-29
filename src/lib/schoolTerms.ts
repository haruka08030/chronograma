import { isEventTask, type Task } from '../types/task'
import { courseAssignments, courseKey, eventCourse, type CourseLink } from './courseLinks'
import { parseCanvasTaskId } from './canvasIds'
import { normalizeAbsenceCourses, type Attendance } from './absenceCourses'
import { merge3, merge3Record, merge3Set, type Side } from './settingMerge'
import {
  ABSENCE_CLASS_MAX,
  ABSENCE_DATES_MAX,
  ABSENCE_LIMIT_MAX,
  TIMETABLE_WEEKDAYS,
  periodIndexOf,
  suggestTerm,
  type Timetable,
  type TimetablePeriod,
} from './timetable'
import { isoWeekday } from './recurrence'
import { fromDateKey } from './dateKey'

/**
 * 学校の学期と授業（#622、追加機能「学校」）。学期を箱にして、その中に授業を置き、授業ごとに欠席と課題を持つ。
 *
 * - 学期は名前・始まり・終わり。重ならない。日付の入っている学期がその日の学期（欠席はその日の学期に数える）
 * - 授業は名前（`courseKey`）で 1 つ。時間割のマスの授業・「授業を追加」で入れた授業・学期の間に締切のある Canvas・Moodle の科目が並ぶ
 * - 課題は授業につながる科目の未完了の課題（予定のカードのつながり `courseLinks` と同じ決め方）
 *
 * 追加機能の設定（`user_addons.addons.school`）に持つ。前の版のアプリも知らない項目を残して送り直すので消えない。
 * まだ無ければ、今までの時間割の学期・欠席と欠席の一覧の授業から 1 つめの学期を作って見せる（`schoolOf`。書くのは何かを変えたとき）
 */
export type Term = {
  id: string
  /** 「前期」「2026 後期」など。空なら期間で見せる */
  name: string
  /** `yyyy-MM-dd` */
  termStart: string
  /** `yyyy-MM-dd`（この日まで） */
  termEnd: string
  /** 欠席した日（授業名（`courseKey`）→ `yyyy-MM-dd` の並び、古い順。学期の中の日だけ） */
  absences: Record<string, string[]>
  /** 休める回数（授業名（`courseKey`）→ 回数）。無ければ時間割の授業は学期の回数の 1/3、ほかは決めない */
  absenceLimits: Record<string, number>
  /** 「授業を追加」で入れた授業の名前（時間割・LMS に無くても並ぶ） */
  courses: string[]
  /** 一覧から外した Canvas・Moodle の科目（`courseKey`） */
  hidden: string[]
}

export type School = { terms: Term[] }

/** 学期の数・名前の長さの上限 */
export const TERM_MAX = 24
export const TERM_NAME_MAX = 30

/** 今までの時間割から作る 1 つめの学期の id（どの端末で作っても同じにする） */
export const LEGACY_TERM_ID = 'legacy'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

export const inTermRange = (date: string, term: Pick<Term, 'termStart' | 'termEnd'>) => date >= term.termStart && date <= term.termEnd

function normalizeAbsences(raw: unknown, term: Pick<Term, 'termStart' | 'termEnd'>): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string[]> = {}
  for (const [name, dates] of Object.entries(raw as Record<string, unknown>)) {
    const key = courseKey(name)
    if (!key || !Array.isArray(dates)) continue
    const merged = new Set(out[key] ?? [])
    for (const d of dates) if (typeof d === 'string' && DATE_KEY.test(d) && inTermRange(d, term)) merged.add(d)
    if (merged.size === 0) continue
    if (!out[key] && Object.keys(out).length >= ABSENCE_CLASS_MAX) break
    out[key] = [...merged].sort().slice(-ABSENCE_DATES_MAX)
  }
  return out
}

function normalizeLimits(raw: unknown): Record<string, number> {
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

function normalizeKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((x): x is string => typeof x === 'string').map(courseKey))].filter(Boolean).slice(0, ABSENCE_CLASS_MAX)
}

function normalizeTerm(raw: unknown): Term | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const x = raw as Record<string, unknown>
  if (typeof x.id !== 'string' || !x.id) return null
  if (typeof x.termStart !== 'string' || typeof x.termEnd !== 'string') return null
  if (!DATE_KEY.test(x.termStart) || !DATE_KEY.test(x.termEnd) || x.termStart > x.termEnd) return null
  const range = { termStart: x.termStart, termEnd: x.termEnd }
  return {
    id: x.id,
    name: typeof x.name === 'string' ? x.name.trim().slice(0, TERM_NAME_MAX) : '',
    ...range,
    absences: normalizeAbsences(x.absences, range),
    absenceLimits: normalizeLimits(x.absenceLimits),
    courses: normalizeAbsenceCourses(x.courses),
    hidden: normalizeKeys(x.hidden),
  }
}

/** 保存・同期から読んだ値をそろえる。まだ決めていなければ null。学期は始まり順で、前の学期と重なるものは外す */
export function normalizeSchool(raw: unknown): School | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const terms = Array.isArray((raw as Record<string, unknown>).terms) ? ((raw as Record<string, unknown>).terms as unknown[]) : []
  const seen = new Set<string>()
  const out: Term[] = []
  for (const term of terms
    .map(normalizeTerm)
    .filter((t): t is Term => t !== null)
    .sort((a, b) => a.termStart.localeCompare(b.termStart) || a.id.localeCompare(b.id))) {
    if (seen.has(term.id)) continue
    const prev = out[out.length - 1]
    if (prev && term.termStart <= prev.termEnd) continue
    seen.add(term.id)
    out.push(term)
    if (out.length >= TERM_MAX) break
  }
  return { terms: out }
}

/**
 * 今までの時間割（学期・欠席・休める回数）と欠席の一覧の授業から作る学校。学期を決めていなければ、欠席の日の範囲を学期にする。
 * どちらも無ければ学期なし
 */
export function legacySchool(timetable: Timetable, absenceCourses: readonly string[]): School {
  let { termStart, termEnd } = timetable
  if (!termStart || !termEnd) {
    const dates = Object.values(timetable.absences).flat().sort()
    if (dates.length === 0) return { terms: [] }
    termStart = termStart ?? dates[0]!
    termEnd = termEnd ?? dates[dates.length - 1]!
    if (termStart > termEnd) [termStart, termEnd] = [termEnd, termStart]
  }
  return (
    normalizeSchool({
      terms: [
        {
          id: LEGACY_TERM_ID,
          name: '',
          termStart,
          termEnd,
          absences: timetable.absences,
          absenceLimits: timetable.absenceLimits,
          courses: absenceCourses,
          hidden: [],
        },
      ],
    }) ?? { terms: [] }
  )
}

/** 学校の学期と授業。決めていなければ今までの時間割から（`legacySchool`） */
export function schoolOf(saved: School | null | undefined, timetable: Timetable, absenceCourses: readonly string[]): School {
  return saved ?? legacySchool(timetable, absenceCourses)
}

/** その日の学期（無ければ null） */
export const termOn = (school: School, date: string): Term | null => school.terms.find((t) => inTermRange(date, t)) ?? null

/** 最初に見せる学期: 今日の学期 → これから始まるいちばん近い学期 → いちばん最近の学期 */
export function defaultTerm(school: School, today: string): Term | null {
  return termOn(school, today) ?? school.terms.find((t) => t.termStart > today) ?? school.terms[school.terms.length - 1] ?? null
}

/** 次に足す学期の案。最後の学期の後の前期・後期（学期が無ければ今日の案） */
export function suggestNextTerm(school: School, today: string): { termStart: string; termEnd: string } {
  const last = school.terms[school.terms.length - 1]
  if (!last) return suggestTerm(today)
  let s = suggestTerm(last.termEnd)
  // 最後の学期の終わりの日の案が最後の学期と重なれば、その次の学期（前期 ↔ 後期）
  if (s.termStart <= last.termEnd) {
    const y = Number(s.termStart.slice(0, 4))
    s =
      s.termStart.slice(5) === '04-01'
        ? { termStart: `${y}-10-01`, termEnd: `${y + 1}-01-31` }
        : { termStart: `${y + 1}-04-01`, termEnd: `${y + 1}-07-31` }
  }
  return s
}

/** 学期がほかの学期と重なるか（`exceptId` の学期は数えない） */
export const overlapsTerm = (school: School, range: Pick<Term, 'termStart' | 'termEnd'>, exceptId: string | null) =>
  school.terms.some((t) => t.id !== exceptId && range.termStart <= t.termEnd && t.termStart <= range.termEnd)

/** 学期の 1 つを置き換えた（無ければ足した）学校 */
export function withTerm(school: School, term: Term): School {
  const rest = school.terms.filter((t) => t.id !== term.id)
  return normalizeSchool({ terms: [...rest, term] }) ?? { terms: [] }
}

export const withoutTerm = (school: School, id: string): School => ({ terms: school.terms.filter((t) => t.id !== id) })

export const emptyTerm = (id: string, range: { termStart: string; termEnd: string }, name = ''): Term => ({
  id,
  name,
  ...range,
  absences: {},
  absenceLimits: {},
  courses: [],
  hidden: [],
})

/** その日の回を欠席にした・取り消した学校（その日の学期が無ければ変えない） */
export function withAbsence(school: School, title: string, date: string, absent: boolean): School {
  const term = termOn(school, date)
  const key = courseKey(title)
  if (!term || !key) return school
  const cur = term.absences[key] ?? []
  const next = absent ? [...new Set([...cur, date])].sort() : cur.filter((d) => d !== date)
  const absences = { ...term.absences }
  if (next.length > 0) absences[key] = next
  else delete absences[key]
  return withTerm(school, { ...term, absences })
}

/** 休める回数を決めた（null は決めない） */
export function withAbsenceLimit(school: School, termId: string, title: string, limit: number | null): School {
  const term = school.terms.find((t) => t.id === termId)
  const key = courseKey(title)
  if (!term || !key) return school
  const absenceLimits = { ...term.absenceLimits }
  if (limit === null) delete absenceLimits[key]
  else absenceLimits[key] = Math.min(ABSENCE_LIMIT_MAX, Math.max(0, Math.round(limit)))
  return withTerm(school, { ...term, absenceLimits })
}

/** その日に欠席にしたか */
export function isAbsent(school: School, title: string, date: string): boolean {
  return termOn(school, date)?.absences[courseKey(title)]?.includes(date) ?? false
}

/** 欠席したかを予定の題名と日で聞く形（記録の無い時間で、欠席した回の時間を埋めない） */
export const absentOnOf =
  (school: School) =>
  (title: string, date: string): boolean =>
    isAbsent(school, title, date)

/**
 * 授業名を直したとき（時間割の授業の名前・授業のページ）、どの学期でも欠席・休める回数・追加した授業・外した科目を新しい名前に移す
 * （新しい名前にもあれば欠席は合わせ、回数は新しい名前のもの）
 */
export function renameCourse(school: School, from: string, to: string): School {
  const a = courseKey(from)
  const b = courseKey(to)
  if (!a || !b) return school
  let changed = false
  const terms = school.terms.map((term) => {
    const added = term.courses.some((c) => courseKey(c) === a)
    if (!(a in term.absences) && !(a in term.absenceLimits) && !added && !term.hidden.includes(a)) return term
    if (a === b && !added) return term
    changed = true
    const absences = { ...term.absences }
    const moved = absences[a]
    delete absences[a]
    if (moved) absences[b] = [...new Set([...(absences[b] ?? []), ...moved])].sort()
    const absenceLimits = { ...term.absenceLimits }
    const limit = absenceLimits[a]
    delete absenceLimits[a]
    if (limit !== undefined && absenceLimits[b] === undefined) absenceLimits[b] = limit
    return {
      ...term,
      absences,
      absenceLimits,
      courses: normalizeAbsenceCourses(term.courses.map((c) => (courseKey(c) === a ? to : c))),
      hidden: [...new Set(term.hidden.map((h) => (h === a ? b : h)))],
    }
  })
  return changed ? (normalizeSchool({ terms }) ?? school) : school
}

/** 「授業を追加」で足した学期（同じ名前があれば変えない） */
export function withAddedCourse(school: School, termId: string, title: string): School {
  const term = school.terms.find((t) => t.id === termId)
  if (!term || !courseKey(title)) return school
  const key = courseKey(title)
  return withTerm(school, {
    ...term,
    courses: normalizeAbsenceCourses([...term.courses, title]),
    hidden: term.hidden.filter((h) => h !== key),
  })
}

/** 授業を一覧から外した学期。追加した授業は外し、欠席・休める回数も消す。Canvas・Moodle の科目は外した印を付ける */
export function withRemovedCourse(school: School, termId: string, title: string, lms: boolean): School {
  const term = school.terms.find((t) => t.id === termId)
  const key = courseKey(title)
  if (!term || !key) return school
  const absences = { ...term.absences }
  delete absences[key]
  const absenceLimits = { ...term.absenceLimits }
  delete absenceLimits[key]
  return withTerm(school, {
    ...term,
    absences,
    absenceLimits,
    courses: term.courses.filter((c) => courseKey(c) !== key),
    hidden: lms && !term.hidden.includes(key) ? [...term.hidden, key] : term.hidden,
  })
}

/* ---------- 時間割の授業（毎週の予定）と学期 ---------- */

/**
 * 時間割の授業の回か（#452）。毎週の予定で、学期の中、月〜土のどこかの時限に始まる回。`term` を渡すとその学期の回だけ。
 * 欠席を数えるのはこの回だけ（毎週のほかの予定、1 回だけの予定は数えない）
 */
export function isClassTask(t: Task, periods: readonly TimetablePeriod[], school: School, term?: Term | null): boolean {
  if (!isEventTask(t) || !t.series || t.deletedAt || !t.scheduledDate || !t.startTime) return false
  const at = termOn(school, t.scheduledDate)
  if (!at || (term && at.id !== term.id)) return false
  const weekday = isoWeekday(fromDateKey(t.scheduledDate))
  if (!(TIMETABLE_WEEKDAYS as readonly number[]).includes(weekday)) return false
  return periodIndexOf(periods, t.startTime) >= 0
}

export type ClassAttendance = Attendance & {
  /** 学期の中のこの授業の回の数（時間割に無い授業は 0） */
  total: number
  /** 休める回数を自分で決めたか */
  limitSet: boolean
}

/**
 * 授業の欠席の数と休める回数。時間割の授業は、名前（`courseKey`）が同じ回を合わせて数え、休める回数の既定は学期の回数の 1/3。
 * 回の数は、その名前の回がある毎週の予定の、学期の中の回すべて（途中で名前を直しても、前の名前の過ぎた回も数える）
 */
export function courseAttendance(
  tasks: readonly Task[],
  periods: readonly TimetablePeriod[],
  school: School,
  term: Term,
  title: string,
): ClassAttendance {
  const key = courseKey(title)
  const classes = tasks.filter((t) => isClassTask(t, periods, school, term))
  const seriesIds = new Set(classes.filter((t) => courseKey(t.title) === key).map((t) => t.series!.id))
  const total = classes.filter((t) => seriesIds.has(t.series!.id)).length
  const absent = term.absences[key]?.length ?? 0
  const set = term.absenceLimits[key]
  const limit = set ?? (total > 0 ? Math.floor(total / 3) : null)
  return { total, absent, limit, limitSet: set !== undefined, remaining: limit === null ? null : limit - absent }
}

/* ---------- 学期の授業の一覧 ---------- */

const isLmsTask = (t: Task) => parseCanvasTaskId(t.id) !== null

/** 学期の間に締切のある Canvas・Moodle の課題の科目（最初のタグ）。名前順 */
export function termLmsCourses(tasks: readonly Task[], term: Pick<Term, 'termStart' | 'termEnd'>): string[] {
  const out = new Map<string, string>()
  for (const t of tasks) {
    if (t.deletedAt || !isLmsTask(t) || !t.dueDate || !inTermRange(t.dueDate, term)) continue
    const course = t.tags[0]?.trim()
    if (course && !out.has(courseKey(course))) out.set(courseKey(course), course)
  }
  return [...out.values()].sort((a, b) => a.localeCompare(b))
}

export type TermCourse = {
  title: string
  /** 時間割のマスにある */
  fromTimetable: boolean
  /** 「授業を追加」で入れた */
  added: boolean
  /** Canvas・Moodle の科目から自動で並んだ（時間割・追加した授業につながっていない科目） */
  fromLms: boolean
  /** つながる科目（課題を出す）。無ければ null */
  lms: string | null
  attendance: ClassAttendance
  /** 未完了の課題 */
  assignments: Task[]
}

/**
 * 学期の授業の一覧。時間割の授業 → 追加した授業 → 学期の間に締切のある科目（時間割・追加した授業につながっていない、外していないもの）。
 * 同じ名前（`courseKey`）は 1 つ。あと何回休めるかが少ない順（決めていない授業は後ろ）、同じなら名前順
 */
export function termCourses(
  tasks: readonly Task[],
  periods: readonly TimetablePeriod[],
  school: School,
  term: Term,
  links: readonly CourseLink[],
  lmsAll: readonly string[],
): TermCourse[] {
  const rows = new Map<string, Omit<TermCourse, 'lms' | 'attendance' | 'assignments'>>()
  for (const t of tasks) {
    if (!isClassTask(t, periods, school, term)) continue
    const key = courseKey(t.title)
    if (!rows.has(key)) rows.set(key, { title: t.title, fromTimetable: true, added: false, fromLms: false })
  }
  for (const title of term.courses) {
    const key = courseKey(title)
    const hit = rows.get(key)
    if (hit) hit.added = true
    else rows.set(key, { title, fromTimetable: false, added: true, fromLms: false })
  }
  const lmsOf = (title: string) => eventCourse({ title }, links, lmsAll).course
  const claimed = new Set(
    [...rows.values()]
      .map((r) => lmsOf(r.title))
      .filter((c): c is string => !!c)
      .map(courseKey),
  )
  for (const course of termLmsCourses(tasks, term)) {
    const key = courseKey(course)
    if (claimed.has(key) || rows.has(key) || term.hidden.includes(key)) continue
    rows.set(key, { title: course, fromTimetable: false, added: false, fromLms: true })
  }
  return [...rows.values()]
    .map((r) => {
      const lms = lmsOf(r.title)
      return {
        ...r,
        lms,
        attendance: courseAttendance(tasks, periods, school, term, r.title),
        assignments: lms ? courseAssignments(tasks, lms) : [],
      }
    })
    .sort((a, b) => (a.attendance.remaining ?? Infinity) - (b.attendance.remaining ?? Infinity) || a.title.localeCompare(b.title))
}

/** その名前が学期の授業か（予定のカードの欠席の数を出すか。時間割の授業でなくても、追加した授業・並んでいる科目と同じ名前なら） */
export function isTermCourse(
  tasks: readonly Task[],
  periods: readonly TimetablePeriod[],
  school: School,
  term: Term,
  title: string,
  links: readonly CourseLink[],
  lmsAll: readonly string[],
): boolean {
  const key = courseKey(title)
  return !!key && termCourses(tasks, periods, school, term, links, lmsAll).some((c) => courseKey(c.title) === key)
}

/* ---------- 同期 ---------- */

/**
 * 両方の端末で変えた学校を中身ごとに合わせる（追加機能の設定の中。`mergeAddons` から）。
 * 学期は id ごと、学期の名前・期間は項目ごと、欠席は授業ごとの日付の集合、休める回数は授業ごと、追加した授業・外した科目は名前の集合
 */
export function mergeSchool(base: School | null, l: School | null, r: School | null, prefer: Side, onConflict?: () => void): School | null {
  if (!l || !r) return merge3(base ?? undefined, l ?? undefined, r ?? undefined, prefer, onConflict) ?? null
  const byId = (s: School | null) => new Map((s?.terms ?? []).map((t) => [t.id, t]))
  const bm = byId(base)
  const lm = byId(l)
  const rm = byId(r)
  const [first, second] = prefer === 'l' ? [l, r] : [r, l]
  const terms: Term[] = []
  for (const id of new Set([...first.terms, ...second.terms].map((t) => t.id))) {
    const b = bm.get(id)
    const lt = lm.get(id)
    const rt = rm.get(id)
    if (!lt || !rt) {
      // 片方で消した: もう一方が控えから変えていなければ消す
      const v = merge3(b, lt, rt, prefer, onConflict)
      if (v) terms.push(v)
      continue
    }
    const field = <K extends 'name' | 'termStart' | 'termEnd'>(k: K) => merge3(b?.[k], lt[k], rt[k], prefer, onConflict) as Term[K]
    terms.push({
      id,
      name: field('name'),
      termStart: field('termStart'),
      termEnd: field('termEnd'),
      absences: merge3Record(b?.absences ?? null, lt.absences, rt.absences, prefer, onConflict, (bv, lv, rv, baseKnown) => {
        const dates = merge3Set(baseKnown ? (bv ?? []) : null, lv ?? [], rv ?? [], prefer)
        return dates.length > 0 ? dates.sort() : undefined
      }),
      absenceLimits: merge3Record(b?.absenceLimits ?? null, lt.absenceLimits, rt.absenceLimits, prefer, onConflict),
      courses: merge3Set(b?.courses ?? null, lt.courses, rt.courses, prefer, courseKey),
      hidden: merge3Set(b?.hidden ?? null, lt.hidden, rt.hidden, prefer),
    })
  }
  return normalizeSchool({ terms })
}
