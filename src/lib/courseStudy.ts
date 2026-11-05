import { isLogTask, isSleepTask, type Task } from '../types/task'
import { addDays, startOfWeek } from 'date-fns'
import { courseKey } from './courseLinks'
import { fromDateKey, toDateKey } from './dateKey'
import { isDeletedTask } from './taskLifecycle'
import { durationMinutesForTaskSlot } from './taskTimeRange'
import { timeToMinutes } from './clockTime'
import type { Term } from './schoolTerms'

/**
 * 授業ごとの勉強時間（#672）。記録に授業の欄を足さず、今の記録から数える（ラベルは「勉強」のような大きな分け方のまま）。
 * 学期の間（今日まで）に始めた記録のうち:
 * - 課題: ▶ で始めた元の To-Do（`sourceTaskId`）の最初のタグが、授業につながる科目（Canvas・Moodle の科目名）
 * - 授業: 題名が授業名と同じで、元が授業の予定か、その日に同じ名前の予定と時間が重なる（予定のカードの ✓・「記録にする」）
 * - 自習: 題名が授業名と同じか、授業名＋空白で始まる（「統計学 復習」）。部分一致はしない（「統計学演習」は入れない）
 * 睡眠・削除・子の記録は入れない
 */

export type StudyKind = 'assignment' | 'class' | 'self'

export interface CourseStudy {
  total: number
  byKind: Record<StudyKind, number>
  /** 学期の始まりの週から今週（学期の終わりまで）の、週（月曜はじまり）ごとの合計 */
  weeks: { start: string; minutes: number }[]
}

function isStudyLog(t: Task): boolean {
  return isLogTask(t) && !isSleepTask(t) && !isDeletedTask(t) && !t.parentId && !!t.dueDate && !!t.startTime && !!t.endTime
}

/** 題名が授業名と同じか、授業名＋空白で始まる */
export function titleIsCourse(title: string, course: string): boolean {
  const k = courseKey(title)
  const c = courseKey(course)
  return !!c && (k === c || k.startsWith(`${c} `))
}

function overlaps(a: Task, b: Task): boolean {
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return false
  return timeToMinutes(a.startTime) < timeToMinutes(b.endTime) && timeToMinutes(b.startTime) < timeToMinutes(a.endTime)
}

/** 記録がこの授業のどれに入るか（入らなければ null） */
export function studyKindOf(
  log: Task,
  course: { title: string; lms: string | null },
  byId: ReadonlyMap<string, Task>,
  events: readonly Task[],
): StudyKind | null {
  const src = log.sourceTaskId ? byId.get(log.sourceTaskId) : undefined
  if (src && src.kind !== 'event' && course.lms && src.tags[0] && courseKey(src.tags[0]) === courseKey(course.lms)) return 'assignment'
  if (!titleIsCourse(log.title, course.title)) return null
  if (courseKey(log.title) === courseKey(course.title)) {
    if (src?.kind === 'event') return 'class'
    const sameDay = events.some(
      (e) => e.scheduledDate === log.dueDate && courseKey(e.title) === courseKey(course.title) && overlaps(e, log),
    )
    if (sameDay) return 'class'
  }
  return 'self'
}

const weekStart = (dateKey: string) => toDateKey(startOfWeek(fromDateKey(dateKey), { weekStartsOn: 1 }))

export function courseStudyTime(
  tasks: readonly Task[],
  term: Term,
  course: { title: string; lms: string | null },
  today: string,
): CourseStudy {
  const until = today < term.termEnd ? today : term.termEnd
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const events = tasks.filter((t) => t.kind === 'event' && !isDeletedTask(t))
  const byKind: Record<StudyKind, number> = { assignment: 0, class: 0, self: 0 }
  const perWeek = new Map<string, number>()
  for (const log of tasks) {
    if (!isStudyLog(log) || log.dueDate! < term.termStart || log.dueDate! > until) continue
    const kind = studyKindOf(log, course, byId, events)
    if (!kind) continue
    const min = durationMinutesForTaskSlot(log) ?? 0
    if (min <= 0) continue
    byKind[kind] += min
    const w = weekStart(log.dueDate!)
    perWeek.set(w, (perWeek.get(w) ?? 0) + min)
  }
  const weeks: CourseStudy['weeks'] = []
  if (term.termStart <= until) {
    for (let w = weekStart(term.termStart); w <= until; w = toDateKey(addDays(fromDateKey(w), 7))) {
      weeks.push({ start: w, minutes: perWeek.get(w) ?? 0 })
    }
  }
  return { total: byKind.assignment + byKind.class + byKind.self, byKind, weeks }
}
