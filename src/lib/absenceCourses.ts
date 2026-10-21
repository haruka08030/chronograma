import { courseKey } from './courseLinks'
import { ABSENCE_CLASS_MAX, type Timetable } from './timetable'

/**
 * 授業の欠席の一覧（#503、追加機能「学校」）。時間割・カレンダーの予定・時限に関係なく、授業ごとに休んだ回数を数える。
 * 一覧に並べる授業の名前は追加機能の設定（`user_addons` の `absenceCourses`）に、休んだ日と休める回数は
 * 時間割の授業と同じ時間割の設定（`absences` / `absenceLimits`、授業名の `courseKey` ごと）に持つ
 */

/** 授業の名前の長さの上限 */
export const ABSENCE_COURSE_TITLE_MAX = 60

/** 保存・同期から読んだ値をそろえる。空・同じ名前（`courseKey`）の重なり（先のもの）を外し、数は上限まで */
export function normalizeAbsenceCourses(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const title = v.trim().slice(0, ABSENCE_COURSE_TITLE_MAX)
    const key = courseKey(title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(title)
    if (out.length >= ABSENCE_CLASS_MAX) break
  }
  return out
}

/** 一覧にある授業か（名前は `courseKey` で比べる） */
export const hasAbsenceCourse = (courses: readonly string[], title: string) => {
  const key = courseKey(title)
  return !!key && courses.some((c) => courseKey(c) === key)
}

/** 授業を足した一覧（同じ名前があれば変えない） */
export const withAbsenceCourse = (courses: readonly string[], title: string) => normalizeAbsenceCourses([...courses, title])

/** 授業を外した一覧 */
export const withoutAbsenceCourse = (courses: readonly string[], title: string) => courses.filter((c) => courseKey(c) !== courseKey(title))

/** 授業の名前を直した一覧（並びの位置は保つ） */
export const renamedAbsenceCourse = (courses: readonly string[], from: string, to: string) =>
  normalizeAbsenceCourses(courses.map((c) => (courseKey(c) === courseKey(from) ? to : c)))

/** 欠席の数と休める回数。休める回数を決めていなければ `limit` / `remaining` は null（回数だけ出す） */
export type Attendance = {
  absent: number
  limit: number | null
  remaining: number | null
}

/** 一覧の授業の欠席の数（時間割の授業は `classAttendance` のほう。学期の回数から休める回数の既定を出す） */
export function courseAttendance(timetable: Pick<Timetable, 'absences' | 'absenceLimits'>, title: string): Attendance {
  const key = courseKey(title)
  const absent = timetable.absences[key]?.length ?? 0
  const limit = timetable.absenceLimits[key] ?? null
  return { absent, limit, remaining: limit === null ? null : limit - absent }
}
