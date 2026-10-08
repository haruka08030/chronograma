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
  planTimetableSync,
  suggestTerm,
  timetableClasses,
  type Timetable,
} from './timetable'

const NOW = '2026-10-08T00:00:00.000Z'
const tt: Timetable = { periods: [...DEFAULT_PERIODS], termStart: '2026-10-01', termEnd: '2027-01-31', skipHolidays: false }

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
