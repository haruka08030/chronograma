import { describe, expect, it } from 'vitest'
import type { EventSeries, Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { DEFAULT_PERIODS, DEFAULT_TIMETABLE, type Timetable } from './timetable'
import {
  LEGACY_TERM_ID,
  courseAttendance,
  defaultTerm,
  emptyTerm,
  isAbsent,
  isClassTask,
  legacySchool,
  mergeSchool,
  normalizeSchool,
  overlapsTerm,
  renameCourse,
  suggestNextTerm,
  termCourses,
  withAbsence,
  withAbsenceLimit,
  withAddedCourse,
  withRemovedCourse,
  withTerm,
  type School,
} from './schoolTerms'

const NOW = '2026-10-08T00:00:00.000Z'
const periods = [...DEFAULT_PERIODS]
const fall = emptyTerm('fall', { termStart: '2026-10-01', termEnd: '2027-01-31' }, '後期')
const spring = emptyTerm('spring', { termStart: '2026-04-01', termEnd: '2026-07-31' }, '前期')
const school: School = { terms: [spring, fall] }

function cls(id: string, date: string, series: EventSeries | null, start = '09:00', end = '10:30', extra: Partial<Task> = {}): Task {
  return {
    ...TASK_DEFAULTS,
    id,
    title: '経済学入門',
    createdAt: NOW,
    updatedAt: NOW,
    listId: '__inbox__',
    scheduledDate: date,
    startTime: start,
    endTime: end,
    kind: 'event',
    series,
    ...extra,
  } as Task
}

const lmsTask = (id: string, course: string, dueDate: string, extra: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id: `canvas-s1-assignment-${id}`,
    title: `課題 ${id}`,
    tags: [course],
    dueDate,
    parentId: null,
    completed: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  }) as Task

const mon: EventSeries = { id: 's-mon', weekdays: [1], until: '2027-01-31', skipHolidays: false }
const thu: EventSeries = { id: 's-thu', weekdays: [4], until: '2027-01-31', skipHolidays: false }
// 月曜 1 限が 4 回・木曜 3 限が 5 回（同じ授業名）。学期の外の回・時限の外の回・別の授業は数えない
const rows = [
  ...['05', '12', '19', '26'].map((d, i) => cls(`m${i}`, `2026-10-${d}`, mon)),
  ...['01', '08', '15', '22', '29'].map((d, i) => cls(`t${i}`, `2026-10-${d}`, thu, '13:00', '14:30')),
  cls('out', '2026-09-28', mon),
  cls('late', '2026-10-05', { ...mon, id: 's-late' }, '20:00', '21:00'),
  cls('other', '2026-10-05', { ...mon, id: 's-other' }, '10:40', '12:10', { title: '統計学' }),
]

describe('学期（#622）', () => {
  it('読んだ値は始まり順にし、形の合わない学期・前の学期と重なる学期を外す。決めていなければ null', () => {
    expect(normalizeSchool(undefined)).toBeNull()
    const out = normalizeSchool({
      terms: [
        fall,
        { ...spring },
        { id: 'bad', termStart: '2026-08-01', termEnd: '2026-07-01' },
        { ...fall, id: 'dup', termStart: '2026-12-01' },
      ],
    })
    expect(out!.terms.map((t) => t.id)).toEqual(['spring', 'fall'])
  })

  it('最初に見せる学期は今日の学期 → これからの学期 → いちばん最近の学期', () => {
    expect(defaultTerm(school, '2026-10-26')?.id).toBe('fall')
    expect(defaultTerm(school, '2026-08-15')?.id).toBe('fall')
    expect(defaultTerm(school, '2027-03-01')?.id).toBe('fall')
    expect(defaultTerm({ terms: [] }, '2026-10-26')).toBeNull()
  })

  it('次に足す学期の案は最後の学期の次（前期 ↔ 後期）。重なりを見分ける', () => {
    expect(suggestNextTerm(school, '2026-10-26')).toEqual({ termStart: '2027-04-01', termEnd: '2027-07-31' })
    expect(suggestNextTerm({ terms: [spring] }, '2026-05-01')).toEqual({ termStart: '2026-10-01', termEnd: '2027-01-31' })
    expect(overlapsTerm(school, { termStart: '2026-07-01', termEnd: '2026-09-01' }, null)).toBe(true)
    expect(overlapsTerm(school, { termStart: '2026-07-01', termEnd: '2026-09-01' }, 'spring')).toBe(false)
  })

  it('今までの時間割の学期・欠席・休める回数と欠席の一覧の授業は、1 つめの学期になる', () => {
    const tt: Timetable = {
      ...DEFAULT_TIMETABLE,
      termStart: '2026-10-01',
      termEnd: '2027-01-31',
      absences: { 経済学入門: ['2026-10-05'] },
      absenceLimits: { 経済学入門: 4 },
    }
    expect(legacySchool(tt, ['統計学'])).toEqual({
      terms: [
        {
          id: LEGACY_TERM_ID,
          name: '',
          termStart: '2026-10-01',
          termEnd: '2027-01-31',
          absences: { 経済学入門: ['2026-10-05'] },
          absenceLimits: { 経済学入門: 4 },
          courses: ['統計学'],
          hidden: [],
        },
      ],
    })
    // 学期を決めていなければ欠席の日の範囲。どちらも無ければ学期なし
    expect(legacySchool({ ...DEFAULT_TIMETABLE, absences: { a: ['2026-10-05', '2026-11-02'] } }, []).terms[0]).toMatchObject({
      termStart: '2026-10-05',
      termEnd: '2026-11-02',
    })
    expect(legacySchool(DEFAULT_TIMETABLE, ['統計学'])).toEqual({ terms: [] })
  })
})

describe('授業の欠席（#452・#622）', () => {
  it('授業の回は、学期の中・月〜土・どこかの時限に始まる毎週の予定だけ。学期を渡すとその学期の回だけ', () => {
    const at = (id: string) => rows.find((t) => t.id === id)!
    expect(isClassTask(at('m0'), periods, school)).toBe(true)
    expect(isClassTask(at('m0'), periods, school, spring)).toBe(false)
    expect(isClassTask(at('out'), periods, school)).toBe(false)
    expect(isClassTask(at('late'), periods, school)).toBe(false)
    expect(isClassTask(cls('once', '2026-10-05', null), periods, school)).toBe(false)
  })

  it('同じ授業名の回を合わせて数え、休める回数は決めていなければ 1/3（時間割に無い授業は決めない）', () => {
    expect(courseAttendance(rows, periods, school, fall, ' 経済学入門 ')).toEqual({
      total: 9,
      absent: 0,
      limit: 3,
      limitSet: false,
      remaining: 3,
    })
    expect(courseAttendance(rows, periods, school, fall, '体育')).toMatchObject({ total: 0, limit: null, remaining: null })
  })

  it('欠席はその日の学期に付く。学期の無い日は付かない', () => {
    let next = withAbsence(school, '経済学入門', '2026-10-05', true)
    next = withAbsence(next, '経済学入門', '2026-10-05', true)
    next = withAbsence(next, '経済学入門', '2026-09-15', true)
    next = withAbsence(next, '経済学入門', '2026-05-11', true)
    expect(next.terms.find((t) => t.id === 'fall')!.absences).toEqual({ 経済学入門: ['2026-10-05'] })
    expect(next.terms.find((t) => t.id === 'spring')!.absences).toEqual({ 経済学入門: ['2026-05-11'] })
    expect(isAbsent(next, '経済学入門', '2026-10-05')).toBe(true)
    expect(isAbsent(withAbsence(next, '経済学入門', '2026-10-05', false), '経済学入門', '2026-10-05')).toBe(false)
  })

  it('休める回数を決めると残りがそれで決まる', () => {
    let next = withAbsenceLimit(school, 'fall', '経済学入門', 2)
    next = withAbsence(next, '経済学入門', '2026-10-05', true)
    const fallNow = next.terms.find((t) => t.id === 'fall')!
    expect(courseAttendance(rows, periods, next, fallNow, '経済学入門')).toMatchObject({ limit: 2, limitSet: true, remaining: 1 })
    expect(withAbsenceLimit(next, 'fall', '経済学入門', null).terms.find((t) => t.id === 'fall')!.absenceLimits).toEqual({})
  })

  it('授業名を直すと、どの学期でも欠席・休める回数・追加した授業が新しい名前に移る', () => {
    let next = withAbsenceLimit(withAbsence(school, '経済学入門', '2026-10-05', true), 'fall', '経済学入門', 4)
    next = withAddedCourse(next, 'spring', '経済学入門')
    const moved = renameCourse(next, '経済学入門', '経済学入門 A')
    const f = moved.terms.find((t) => t.id === 'fall')!
    expect(f.absences).toEqual({ '経済学入門 a': ['2026-10-05'] })
    expect(f.absenceLimits).toEqual({ '経済学入門 a': 4 })
    expect(moved.terms.find((t) => t.id === 'spring')!.courses).toEqual(['経済学入門 A'])
  })
})

describe('学期の授業の一覧（#622）', () => {
  const tasks = [
    ...rows,
    lmsTask('1', 'econ', '2026-10-20'),
    lmsTask('2', 'stat', '2026-11-02'),
    lmsTask('3', 'stat', '2026-11-09', { completed: true }),
    // 前の学期の科目は並ばない
    lmsTask('4', 'old', '2026-06-01'),
  ]

  it('時間割の授業・追加した授業・学期の間に課題のある科目を 1 つの一覧に。課題は未完了のものだけ', () => {
    const s = withAddedCourse(school, 'fall', '体育')
    const fallNow = s.terms.find((t) => t.id === 'fall')!
    const out = termCourses(tasks, periods, s, fallNow, [], ['econ', 'old', 'stat'])
    // 並びはあと何回休めるかが少ない順（統計学は 1 回だけで休める回数 0）
    expect(out[0]!.title).toBe('統計学')
    expect(out.map((c) => [c.title, c.fromTimetable, c.added, c.fromLms]).sort()).toEqual([
      ['econ', false, false, true],
      ['stat', false, false, true],
      ['体育', false, true, false],
      ['経済学入門', true, false, false],
      ['統計学', true, false, false],
    ])
    expect(out.find((c) => c.title === 'stat')!.assignments.map((t) => t.id)).toEqual(['canvas-s1-assignment-2'])
  })

  it('時間割の授業につながった科目は別に並べない。外した科目は並べない', () => {
    const out = termCourses(tasks, periods, school, fall, [{ title: '統計学', course: 'stat' }], ['econ', 'stat'])
    expect(out.map((c) => c.title).sort()).toEqual(['econ', '経済学入門', '統計学'])
    expect(out.find((c) => c.title === '統計学')!.lms).toBe('stat')
    const hidden = withRemovedCourse(school, 'fall', 'econ', true)
    const fallNow = hidden.terms.find((t) => t.id === 'fall')!
    expect(termCourses(tasks, periods, hidden, fallNow, [], ['econ', 'stat']).map((c) => c.title)).not.toContain('econ')
    // 足し直すと外した印も消える
    expect(withAddedCourse(hidden, 'fall', 'econ').terms.find((t) => t.id === 'fall')!.hidden).toEqual([])
  })
})

describe('学校の同期（#622）', () => {
  it('学期は id ごと、欠席は授業ごとの日付の集合、追加した授業は名前の集合で合わせる', () => {
    const base = school
    const l = withAddedCourse(withAbsence(base, '経済学入門', '2026-10-05', true), 'fall', '体育')
    const r = withTerm(withAbsence(base, '経済学入門', '2026-10-12', true), { ...spring, name: '2026 前期' })
    const out = mergeSchool(base, l, r, 'l')!
    const f = out.terms.find((t) => t.id === 'fall')!
    expect(f.absences).toEqual({ 経済学入門: ['2026-10-05', '2026-10-12'] })
    expect(f.courses).toEqual(['体育'])
    expect(out.terms.find((t) => t.id === 'spring')!.name).toBe('2026 前期')
  })

  it('片方で消した学期は、もう一方が変えていなければ消す。まだ無い側は、ある側のまま', () => {
    expect(mergeSchool(school, { terms: [fall] }, school, 'r')!.terms.map((t) => t.id)).toEqual(['fall'])
    expect(mergeSchool(null, null, school, 'l')).toEqual(school)
  })
})
