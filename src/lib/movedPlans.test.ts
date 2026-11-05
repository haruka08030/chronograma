import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import {
  cancelledAfterStart,
  MAX_MOVED_PLANS,
  movedPlansAfter,
  movedPlansOnDay,
  planTraces,
  readMovedPlans,
  withMovedPlans,
} from './movedPlans'
import { wallMinutes } from './wallTime'
import { fromAppWall } from './timeZone'

const task = (id: string, over: Partial<Task> = {}): Task => ({
  ...TASK_DEFAULTS,
  id,
  title: id,
  description: '',
  completed: false,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  order: 0,
  listId: 'inbox',
  sectionId: null,
  parentId: null,
  dueDate: null,
  startTime: null,
  endTime: null,
  priority: 'none',
  tags: [],
  recurrence: null,
  ...over,
})

const TODAY = '2026-10-03'
/** 今（TODAY の 12:00） */
const NOW = wallMinutes(TODAY, '12:00')
const to = (date: string | null, startTime: string | null = null, endTime: string | null = null) => ({ date, startTime, endTime })

describe('movedPlansAfter', () => {
  it('始まった予定を別の日へ移すと、元の日と時刻と移した先を残す（時刻の無い To-Do はその日が来ていれば）', () => {
    const t = task('a', { scheduledDate: '2026-10-02', startTime: '13:00', endTime: '14:00' })
    expect(movedPlansAfter(t, to('2026-10-05'), NOW)).toEqual([
      { date: '2026-10-02', startTime: '13:00', endTime: '14:00', to: '2026-10-05' },
    ])
    expect(movedPlansAfter(task('b', { scheduledDate: TODAY }), to('2026-10-04'), NOW)).toEqual([
      { date: TODAY, startTime: null, endTime: null, to: '2026-10-04' },
    ])
    // 予定（To-Do でない予定）も
    expect(movedPlansAfter({ ...t, kind: 'event' }, to('2026-10-05'), NOW)).toHaveLength(1)
  })

  it('始まった予定を同じ日の別の時刻へずらすと残し、何度ずらしても元の時刻は最初のまま。元の時刻へ戻すと消す', () => {
    const t = task('a', { kind: 'event', scheduledDate: TODAY, startTime: '10:00', endTime: '11:00' })
    const once = movedPlansAfter(t, to(TODAY, '14:00', '15:00'), NOW)
    expect(once).toEqual([{ date: TODAY, startTime: '10:00', endTime: '11:00', to: TODAY }])
    // 14:00 はまだ始まっていなくても、元の 10:00 の控えは残したまま
    const moved = { ...t, startTime: '14:00', endTime: '15:00', movedPlans: once }
    expect(movedPlansAfter(moved, to(TODAY, '16:00', '17:00'), NOW)).toEqual(once)
    expect(movedPlansAfter(moved, to('2026-10-04', '16:00', '17:00'), NOW)).toEqual([
      { date: TODAY, startTime: '10:00', endTime: '11:00', to: '2026-10-04' },
    ])
    expect(movedPlansAfter(moved, to(TODAY, '10:00', '11:00'), NOW)).toEqual([])
    // 長さだけ変えた・時刻を外したのは残さない
    expect(movedPlansAfter(t, to(TODAY, '10:00', '12:00'), NOW)).toBeUndefined()
    expect(movedPlansAfter(t, to(TODAY), NOW)).toBeUndefined()
  })

  it('始まる前の付け替え・予定日を外す・完了した To-Do・子は残さない', () => {
    expect(movedPlansAfter(task('a', { scheduledDate: '2026-10-04' }), to('2026-10-06'), NOW)).toBeUndefined()
    expect(
      movedPlansAfter(task('a', { scheduledDate: TODAY, startTime: '18:00', endTime: '19:00' }), to('2026-10-04'), NOW),
    ).toBeUndefined()
    expect(
      movedPlansAfter(task('a', { scheduledDate: TODAY, startTime: '18:00', endTime: '19:00' }), to(TODAY, '20:00', '21:00'), NOW),
    ).toBeUndefined()
    expect(movedPlansAfter(task('a', { scheduledDate: '2026-10-02' }), to(null), NOW)).toBeUndefined()
    expect(movedPlansAfter(task('a', { scheduledDate: '2026-10-02', completed: true }), to('2026-10-05'), NOW)).toBeUndefined()
    expect(movedPlansAfter(task('a', { scheduledDate: '2026-10-02', parentId: 'p' }), to('2026-10-05'), NOW)).toBeUndefined()
  })

  it('同じ日から移し直したら行き先だけ新しくし、控えのある日へ戻したらその日の控えを消す', () => {
    const once = task('a', {
      scheduledDate: '2026-10-05',
      movedPlans: movedPlansAfter(task('a', { scheduledDate: '2026-10-02' }), to('2026-10-05'), NOW),
    })
    // 10/5 はまだ先の日なので、10/5 → 10/7 は控えを足さない
    expect(movedPlansAfter(once, to('2026-10-07'), NOW)).toEqual([{ date: '2026-10-02', startTime: null, endTime: null, to: '2026-10-05' }])
    expect(movedPlansAfter(once, to('2026-10-02'), NOW)).toEqual([])
  })

  it(`控えは ${MAX_MOVED_PLANS} 件まで（古いものから捨てる）`, () => {
    let t = task('a', { scheduledDate: '2026-01-01' })
    for (let d = 1; d <= MAX_MOVED_PLANS + 5; d++) {
      const from = `2026-0${d <= 31 ? 1 : 2}-${String(((d - 1) % 31) + 1).padStart(2, '0')}`
      const next = `2026-0${d + 1 <= 31 ? 1 : 2}-${String((d % 31) + 1).padStart(2, '0')}`
      t = { ...t, scheduledDate: from }
      t = { ...t, movedPlans: movedPlansAfter(t, to(next), NOW), scheduledDate: next }
    }
    expect(t.movedPlans).toHaveLength(MAX_MOVED_PLANS)
    expect(t.movedPlans!.at(-1)!.date).toBe('2026-02-04')
  })
})

describe('planTraces', () => {
  const ev = task('a', { kind: 'event', scheduledDate: TODAY, startTime: '10:00', endTime: '11:00' })
  const at = (hm: string) => fromAppWall(new Date(`${TODAY}T${hm}:00`)).toISOString()

  it('始まってから消した予定は、その位置を「やめた」（to: null）として足す', () => {
    expect(planTraces({ ...ev, deletedAt: at('10:30') })).toEqual([{ date: TODAY, startTime: '10:00', endTime: '11:00', to: null }])
    expect(cancelledAfterStart({ ...ev, deletedAt: at('09:30') })).toBe(false)
    expect(planTraces({ ...ev, deletedAt: at('09:30') })).toEqual([])
  })

  it('アーカイブしたもの・完了した To-Do・時刻の無いものは消しても跡にしない', () => {
    expect(planTraces({ ...ev, deletedAt: at('10:30'), archivedAt: at('10:30') })).toEqual([])
    expect(planTraces({ ...ev, kind: 'todo', completed: true, deletedAt: at('10:30') })).toEqual([])
    expect(planTraces({ ...ev, startTime: null, endTime: null, deletedAt: at('10:30') })).toEqual([])
  })
})

describe('movedPlansOnDay: 同じ日の中でずらしたもの', () => {
  it('同じ日の中でずらしたものは今の時刻の予定で数えるので入れない', () => {
    const plan = { date: TODAY, startTime: '10:00', endTime: '11:00', to: TODAY }
    expect(movedPlansOnDay([task('a', { scheduledDate: TODAY, startTime: '14:00', endTime: '15:00', movedPlans: [plan] })], TODAY)).toEqual(
      [],
    )
    const away = task('b', { scheduledDate: '2026-10-04', movedPlans: [{ ...plan, to: '2026-10-04' }] })
    expect(movedPlansOnDay([away], TODAY)).toHaveLength(1)
  })
})

describe('readMovedPlans / withMovedPlans', () => {
  it('形の合わない控えは捨て、1 つも無ければ null。時刻は両方そろったときだけ', () => {
    expect(readMovedPlans(null)).toBeNull()
    expect(readMovedPlans([{ date: 'x', to: '2026-10-05' }, 3])).toBeNull()
    expect(readMovedPlans([{ date: '2026-10-02', to: '2026-10-05', startTime: '13:00' }])).toEqual([
      { date: '2026-10-02', startTime: null, endTime: null, to: '2026-10-05' },
    ])
  })

  it('控えが無ければ項目ごと持たない', () => {
    const t = withMovedPlans(task('a'), [{ date: '2026-10-02', startTime: null, endTime: null, to: '2026-10-05' }])
    expect('movedPlans' in t).toBe(true)
    expect('movedPlans' in withMovedPlans(t, [])).toBe(false)
    const plain = task('b')
    expect(withMovedPlans(plain, null)).toBe(plain)
  })
})

describe('movedPlansOnDay', () => {
  const moved = { date: '2026-10-02', startTime: '13:00', endTime: '14:00', to: '2026-10-05' }
  const tasks = [
    task('done', { scheduledDate: '2026-10-02', completed: true, completedAt: '2026-10-02T10:00:00Z' }),
    task('left', { scheduledDate: '2026-10-02' }),
    task('moved', { scheduledDate: '2026-10-05', movedPlans: [moved] }),
    task('trashed', { scheduledDate: '2026-10-05', movedPlans: [moved], deletedAt: '2026-10-03T00:00:00Z' }),
    task('someday', { scheduledDate: '2026-10-05', movedPlans: [moved], listId: 'someday' }),
  ]

  it('その日から移した予定（ゴミ箱・除いたリストは入れない）', () => {
    expect(movedPlansOnDay(tasks, '2026-10-02', new Set(['someday'])).map((m) => m.task.id)).toEqual(['moved'])
  })
})
