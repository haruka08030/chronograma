import { describe, expect, it } from 'vitest'
import type { EventSeries, Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import {
  changeSeriesRule,
  defaultSeriesUntil,
  hasOtherOccurrences,
  liveSeriesRows,
  readEventSeries,
  seriesDates,
  seriesScopeIds,
  sharedSeriesPatch,
  withSeries,
} from './eventSeries'

const NOW = '2026-10-08T00:00:00.000Z'

function event(id: string, date: string, series?: EventSeries, extra: Partial<Task> = {}): Task {
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
    startTime: '09:00',
    endTime: '10:30',
    priority: 'none',
    tags: [],
    recurrence: null,
    kind: 'event',
    ...(series ? { series } : {}),
    ...extra,
  } as Task
}

/** 連番の id（作った回を見分ける） */
function ids() {
  let n = 0
  return () => `n${++n}`
}

const mondays: EventSeries = { id: 's1', weekdays: [1], until: '2026-11-02', skipHolidays: false }
/** 2026-10-05 から 11-02 までの月曜（10/12 はスポーツの日） */
const MONDAYS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']
const series = (list: string[], s = mondays) => list.map((d, i) => event(`c${i}`, d, s))
const dates = (tasks: Task[]) =>
  tasks
    .filter((t) => !t.deletedAt)
    .map((t) => t.scheduledDate)
    .sort()

describe('回の日付', () => {
  it('選んだ曜日だけを終わりの日まで並べる（その日も含む）', () => {
    expect(seriesDates('2026-10-05', mondays)).toEqual(MONDAYS)
    expect(seriesDates('2026-10-06', { weekdays: [1, 3], until: '2026-10-14', skipHolidays: false })).toEqual([
      '2026-10-07',
      '2026-10-12',
      '2026-10-14',
    ])
  })

  it('祝日を除くと、日本の祝日（スポーツの日・勤労感謝の日）には入れない', () => {
    const rule = { weekdays: [1], until: '2026-11-30', skipHolidays: true }
    const out = seriesDates('2026-10-05', rule)
    expect(out).not.toContain('2026-10-12')
    expect(out).not.toContain('2026-11-23')
    expect(out).toHaveLength(7)
    expect(seriesDates('2026-10-05', { ...rule, skipHolidays: false })).toHaveLength(9)
  })

  it('終わりの日が前なら空、1 年より先は 1 年まで', () => {
    expect(seriesDates('2026-10-05', { ...mondays, until: '2026-10-01' })).toEqual([])
    expect(seriesDates('2026-10-05', { ...mondays, until: '2030-01-01' })).toHaveLength(53)
  })

  it('終わりの日の既定は、学期の終わりが後ならそこまで、無ければ 15 週', () => {
    expect(defaultSeriesUntil('2026-10-05', '2027-01-31')).toBe('2027-01-31')
    expect(defaultSeriesUntil('2026-10-05', '2026-09-30')).toBe('2027-01-17')
    expect(defaultSeriesUntil('2026-10-05')).toBe('2027-01-17')
  })
})

describe('印の読み書き', () => {
  it('id・曜日・終わりの日が使える印だけを読む', () => {
    expect(readEventSeries({ id: 's', weekdays: [3, 1, 3], until: '2026-11-02' })).toEqual({
      id: 's',
      weekdays: [1, 3],
      until: '2026-11-02',
      skipHolidays: false,
    })
    expect(readEventSeries({ weekdays: [1], until: '2026-11-02' })).toBeNull()
    expect(readEventSeries({ id: 's', weekdays: [], until: '2026-11-02' })).toBeNull()
    expect(readEventSeries({ id: 's', weekdays: [1], until: '11/2' })).toBeNull()
    expect(readEventSeries(null)).toBeNull()
  })

  it('印の無い行は項目ごと持たない（同期で「変わった」と見ない）', () => {
    const t = event('a', '2026-10-05', mondays)
    expect('series' in withSeries(t, null)).toBe(false)
    expect(withSeries(t, mondays).series).toEqual(mondays)
  })
})

describe('範囲（この予定のみ / 以降すべて / すべて）', () => {
  const rows = series(MONDAYS)

  it('以降はその回と日付が後の回、すべては消していない回ぜんぶ', () => {
    expect([...seriesScopeIds(rows, rows[2]!, 'one')]).toEqual(['c2'])
    expect([...seriesScopeIds(rows, rows[2]!, 'following')].sort()).toEqual(['c2', 'c3', 'c4'])
    expect([...seriesScopeIds(rows, rows[2]!, 'all')].sort()).toEqual(['c0', 'c1', 'c2', 'c3', 'c4'])
    const withDeleted = rows.map((t) => (t.id === 'c4' ? { ...t, deletedAt: NOW } : t))
    expect([...seriesScopeIds(withDeleted, rows[2]!, 'following')].sort()).toEqual(['c2', 'c3'])
  })

  it('ほかの回があるときだけ範囲を聞く', () => {
    expect(hasOtherOccurrences(rows, rows[0]!)).toBe(true)
    expect(hasOtherOccurrences([rows[0]!], rows[0]!)).toBe(false)
    expect(hasOtherOccurrences(rows, event('x', '2026-10-05'))).toBe(false)
  })

  it('ほかの回に写すのは名前・時刻・色・場所などだけ（日付・種類・印は回ごと）', () => {
    expect(
      sharedSeriesPatch({ title: 'ミクロ経済学', startTime: '10:40', scheduledDate: '2026-10-06', kind: 'todo', location: 'A棟' }),
    ).toEqual({ title: 'ミクロ経済学', startTime: '10:40', location: 'A棟' })
  })
})

describe('繰り返しを付ける・変える・やめる', () => {
  it('繰り返さない予定に付けると、その回に印を付けて翌日から終わりの日までの回を作る', () => {
    const one = event('a', '2026-10-05')
    const out = changeSeriesRule([one], 'a', { weekdays: [1, 3], until: '2026-10-19', skipHolidays: false }, NOW, ids())!
    expect(dates(out)).toEqual(['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19'])
    const sid = out.find((t) => t.id === 'a')!.series!.id
    expect(out.every((t) => t.series?.id === sid)).toBe(true)
    // 写した回は同じ名前・時刻の予定
    expect(out.every((t) => t.kind === 'event' && t.startTime === '09:00' && t.title === '経済学入門')).toBe(true)
  })

  it('最初の回から曜日を変えると、当てはまらない回を外して足りない日の回を作る（同じ印のまま）', () => {
    const out = changeSeriesRule(series(MONDAYS), 'c0', { weekdays: [1, 3], until: '2026-10-14', skipHolidays: false }, NOW, ids())!
    expect(dates(out)).toEqual(['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14'])
    expect(new Set(out.map((t) => t.series!.id))).toEqual(new Set(['s1']))
  })

  it('途中の回から変えると、その回から後を新しい印に分け、前の回の終わりの日を前の回の最後の日にする', () => {
    const out = changeSeriesRule(series(MONDAYS), 'c2', { weekdays: [2], until: '2026-11-03', skipHolidays: false }, NOW, ids())!
    const before = out.filter((t) => t.series?.id === 's1')
    expect(before.map((t) => t.scheduledDate)).toEqual(['2026-10-05', '2026-10-12'])
    expect(before.every((t) => t.series!.until === '2026-10-12')).toBe(true)
    const after = out.filter((t) => t.series?.id !== 's1')
    // その回（10/19 月）は残し、火曜の回を作る
    expect(after.map((t) => t.scheduledDate).sort()).toEqual(['2026-10-19', '2026-10-20', '2026-10-27', '2026-11-03'])
    expect(new Set(after.map((t) => t.series!.id)).size).toBe(1)
  })

  it('1 回だけ消した回（休講）の日は作り直さない', () => {
    const rows = series(MONDAYS).map((t) => (t.id === 'c3' ? { ...t, deletedAt: NOW } : t))
    const out = changeSeriesRule(rows, 'c0', { ...mondays, until: '2026-11-09' }, NOW, ids())!
    expect(dates(out)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-11-02', '2026-11-09'])
  })

  it('祝日を除くに変えると、祝日の回を外す', () => {
    const out = changeSeriesRule(series(MONDAYS), 'c0', { ...mondays, skipHolidays: true }, NOW, ids())!
    expect(dates(out)).not.toContain('2026-10-12')
    expect(out.every((t) => t.series!.skipHolidays)).toBe(true)
  })

  it('やめると、その回より後を外し、その回は繰り返さない予定になる', () => {
    const out = changeSeriesRule(series(MONDAYS), 'c2', null, NOW, ids())!
    expect(dates(out)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19'])
    expect('series' in out.find((t) => t.id === 'c2')!).toBe(false)
    expect(liveSeriesRows(out, 's1').every((t) => t.series.until === '2026-10-12')).toBe(true)
  })

  it('変わらなければ null（取り消しの履歴・同期の書き込みを積まない）', () => {
    expect(changeSeriesRule(series(MONDAYS), 'c0', mondays, NOW, ids())).toBeNull()
    expect(changeSeriesRule([event('a', '2026-10-05')], 'a', null, NOW, ids())).toBeNull()
  })
})
