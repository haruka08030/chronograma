import { describe, expect, it } from 'vitest'
import type { EventSeries, Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import {
  DEFAULT_PERIODS,
  DEFAULT_TIMETABLE,
  cellKey,
  classStartDate,
  normalizeTimetable,
  periodIndexOf,
  suggestTerm,
  timetableClasses,
  attendanceTone,
  classAttendance,
  isAbsent,
  isClassTask,
  renameAttendance,
  withAbsence,
  withAbsenceLimit,
  type Timetable,
} from './timetable'
import { planTimetableSync } from './settingPlans'

const NOW = '2026-10-08T00:00:00.000Z'
const tt: Timetable = {
  periods: [...DEFAULT_PERIODS],
  termStart: '2026-10-01',
  termEnd: '2027-01-31',
  skipHolidays: false,
  absences: {},
  absenceLimits: {},
}

function cls(id: string, date: string, series: EventSeries, start = '09:00', end = '10:30', extra: Partial<Task> = {}): Task {
  return {
    ...TASK_DEFAULTS,
    id,
    title: '経済学入門',
    description: '',
    completed: false,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    order: 0,
    listId: '__inbox__',
    sectionId: null,
    parentId: null,
    dueDate: null,
    scheduledDate: date,
    startTime: start,
    endTime: end,
    priority: 'none',
    tags: [],
    recurrence: null,
    kind: 'event',
    series,
    ...extra,
  } as Task
}

describe('時間割の設定', () => {
  it('読めない値は既定（よくある 5 限・学期なし・祝日も入れる）', () => {
    expect(normalizeTimetable(null)).toEqual(DEFAULT_TIMETABLE)
    expect(normalizeTimetable('x').periods).toHaveLength(5)
  })

  it('時限は使えるものだけを始まり順に、学期は始まり ≤ 終わりのときだけ', () => {
    const out = normalizeTimetable({
      periods: [
        { start: '10:40', end: '12:10' },
        { start: '09:00', end: '10:30' },
        { start: '13:00', end: '12:00' },
        { start: 'x', end: '14:00' },
      ],
      termStart: '2027-02-01',
      termEnd: '2027-01-31',
      skipHolidays: true,
    })
    expect(out.periods).toEqual([
      { start: '09:00', end: '10:30' },
      { start: '10:40', end: '12:10' },
    ])
    expect(out.termStart).toBeNull()
    expect(out.termEnd).toBeNull()
    expect(out.skipHolidays).toBe(true)
  })

  it('学期の案は 3〜8 月なら前期、9〜2 月なら後期', () => {
    expect(suggestTerm('2026-04-10')).toEqual({ termStart: '2026-04-01', termEnd: '2026-07-31' })
    expect(suggestTerm('2026-10-08')).toEqual({ termStart: '2026-10-01', termEnd: '2027-01-31' })
    expect(suggestTerm('2027-01-20')).toEqual({ termStart: '2026-10-01', termEnd: '2027-01-31' })
  })

  it('授業を入れ始めるのは学期の始まりと今日の遅いほう', () => {
    expect(classStartDate(tt, '2026-10-08')).toBe('2026-10-08')
    expect(classStartDate({ termStart: '2027-04-01' }, '2026-10-08')).toBe('2027-04-01')
    expect(classStartDate({ termStart: null }, '2026-10-08')).toBe('2026-10-08')
  })

  it('時限は始まり ≤ 時刻 < 終わり', () => {
    expect(periodIndexOf(DEFAULT_PERIODS, '09:00')).toBe(0)
    expect(periodIndexOf(DEFAULT_PERIODS, '10:40')).toBe(1)
    expect(periodIndexOf(DEFAULT_PERIODS, '12:30')).toBe(-1)
    expect(periodIndexOf(DEFAULT_PERIODS, null)).toBe(-1)
  })
})

describe('時間割のマス', () => {
  const mon: EventSeries = { id: 'econ', weekdays: [1], until: '2027-01-25', skipHolidays: false }
  const wed: EventSeries = { id: 'eng', weekdays: [3], until: '2027-01-27', skipHolidays: false }

  it('学期の間の今日から後の毎週の予定を、曜日と始まりの時限で並べる', () => {
    const tasks = [
      cls('past', '2026-10-05', mon),
      cls('a', '2026-10-12', mon),
      cls('b', '2026-10-19', mon),
      cls('c', '2026-10-14', wed, '10:40', '12:10', { title: '英語', color: '#039BE5' }),
      // 繰り返さない予定・消した回・学期の後の回は入れない
      cls('plain', '2026-10-13', mon, '09:00', '10:30', { series: null, title: '面談' }),
      cls('gone', '2026-10-26', mon, '09:00', '10:30', { deletedAt: NOW }),
      cls('later', '2027-02-01', mon),
    ]
    const out = timetableClasses(tasks, tt, '2026-10-08')
    expect([...out.keys()].sort()).toEqual([cellKey(1, 0), cellKey(3, 1)])
    expect(out.get(cellKey(1, 0))).toMatchObject({ seriesId: 'econ', title: '経済学入門', count: 2, firstTaskId: 'a' })
    expect(out.get(cellKey(3, 1))).toMatchObject({ title: '英語', color: '#039BE5', startTime: '10:40', count: 1 })
  })

  it('どの時限にも入らない時刻の授業はマスに出さない', () => {
    const out = timetableClasses([cls('a', '2026-10-12', mon, '12:20', '12:50')], tt, '2026-10-08')
    expect(out.size).toBe(0)
  })
})

describe('時間割の設定の同期', () => {
  const remote = { timetable: { ...tt, skipHolidays: true }, updatedAt: '2026-10-07T00:00:00.000000+00:00' }

  it('一度も変えていない既定の値は送らず、サーバーの値に合わせる', () => {
    expect(planTimetableSync({ timetable: DEFAULT_TIMETABLE, updatedAt: null }, null)).toEqual({})
    expect(planTimetableSync({ timetable: DEFAULT_TIMETABLE, updatedAt: null }, remote).apply?.timetable.skipHolidays).toBe(true)
  })

  it('手元で変えた値はサーバーに行が無ければ送る・手元だけ変えていれば送る', () => {
    expect(planTimetableSync({ timetable: tt, updatedAt: NOW }, null).push).toMatchObject({ timetable: tt, base: null })
    const plan = planTimetableSync({ timetable: tt, updatedAt: NOW, syncedAt: remote.updatedAt }, remote)
    expect(plan.push).toMatchObject({ timetable: tt, base: remote.updatedAt })
  })
})

describe('授業の欠席（#452）', () => {
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

  it('授業の回は、学期の中・月〜土・どこかの時限に始まる毎週の予定だけ', () => {
    expect(
      isClassTask(
        rows.find((t) => t.id === 'm0')!,
        tt,
      ),
    ).toBe(true)
    expect(
      isClassTask(
        rows.find((t) => t.id === 'out')!,
        tt,
      ),
    ).toBe(false)
    expect(
      isClassTask(
        rows.find((t) => t.id === 'late')!,
        tt,
      ),
    ).toBe(false)
    expect(isClassTask(cls('once', '2026-10-05', mon, '09:00', '10:30', { series: null }), tt)).toBe(false)
  })

  it('同じ授業名の回を合わせて数え、休める回数は決めていなければ 1/3（切り捨て）', () => {
    expect(classAttendance(rows, tt, ' 経済学入門 ')).toEqual({ total: 9, absent: 0, limit: 3, limitSet: false, remaining: 3 })
  })

  it('欠席の印を付け・外せる。学期の外の日付は残さない', () => {
    let next = withAbsence(tt, '経済学入門', '2026-10-05', true)
    next = withAbsence(next, '経済学入門', '2026-10-05', true)
    next = withAbsence(next, '経済学入門', '2026-09-28', true)
    expect(next.absences).toEqual({ 経済学入門: ['2026-10-05'] })
    expect(isAbsent(next, '経済学入門', '2026-10-05')).toBe(true)
    expect(classAttendance(rows, next, '経済学入門').absent).toBe(1)
    expect(withAbsence(next, '経済学入門', '2026-10-05', false).absences).toEqual({})
  })

  it('休める回数を決めると残りがそれで決まり、0 回・超えたら赤・あと 1 回はオレンジ', () => {
    let next = withAbsenceLimit(tt, '経済学入門', 2)
    next = withAbsence(next, '経済学入門', '2026-10-05', true)
    const a = classAttendance(rows, next, '経済学入門')
    expect(a).toMatchObject({ limit: 2, limitSet: true, remaining: 1 })
    expect(attendanceTone(a)).toBe('today')
    expect(attendanceTone({ remaining: 0 })).toBe('overdue')
    expect(attendanceTone({ remaining: -1 })).toBe('overdue')
    expect(attendanceTone({ remaining: 3 })).toBe('future')
    expect(withAbsenceLimit(next, '経済学入門', null).absenceLimits).toEqual({})
  })

  it('授業名を直すと、欠席と休める回数は新しい名前に移る。回の数は前の名前の回も入れる', () => {
    const marked = withAbsenceLimit(withAbsence(tt, '経済学入門', '2026-10-05', true), '経済学入門', 4)
    const moved = renameAttendance(marked, '経済学入門', '経済学入門 A')
    expect(moved.absences).toEqual({ '経済学入門 a': ['2026-10-05'] })
    expect(moved.absenceLimits).toEqual({ '経済学入門 a': 4 })
    const renamed = rows.map((t) => (t.id === 'm3' || t.id === 't4' ? { ...t, title: '経済学入門 A' } : t))
    expect(classAttendance(renamed, moved, '経済学入門 A')).toMatchObject({ total: 9, absent: 1, limit: 4 })
  })

  it('読んだ値の欠席・休める回数は、名前をそろえ、形の合わないものを落とす', () => {
    const out = normalizeTimetable({
      ...tt,
      absences: { ＡＢＣ: ['2026-10-05', 'x', '2026-10-05'], 空: [] },
      absenceLimits: { a: 2, b: -1, c: 1.5 },
    })
    expect(out.absences).toEqual({ abc: ['2026-10-05'] })
    expect(out.absenceLimits).toEqual({ a: 2 })
  })
})
