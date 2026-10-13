import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from './taskDefaults'
import { getEstimateRows, loggedMinutesByTask, loggedMinutesForTask } from './estimateActual'

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    title: id,
    description: '',
    completed: false,
    completedAt: null,
    createdAt: '2026-09-01T12:00:00Z',
    updatedAt: '2026-09-01T12:00:00Z',
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
  }) as Task

const log = (id: string, day: string, start: string, end: string, over: Partial<Task> = {}): Task =>
  task(id, { kind: 'log', title: `log ${id}`, dueDate: day, startTime: start, endTime: end, completed: true, ...over })

const done = (id: string, day: string, over: Partial<Task> = {}): Task =>
  task(id, { completed: true, completedAt: `${day}T12:00:00Z`, updatedAt: `${day}T12:00:00Z`, ...over })

const TODAY = '2026-10-08'

describe('loggedMinutesByTask: ▶ の記録（sourceTaskId）', () => {
  it('結び付いた記録を、何日かに分けた分も足す', () => {
    const tasks = [
      done('es', '2026-10-07', { title: 'ES 書く', estimateMinutes: 60 }),
      log('a', '2026-10-05', '10:00', '11:00', { sourceTaskId: 'es' }),
      log('b', '2026-10-07', '20:00', '21:30', { sourceTaskId: 'es' }),
    ]
    expect(loggedMinutesByTask(tasks, TODAY).get('es')).toBe(150)
  })

  it('日をまたぐ記録は全部の長さを足す', () => {
    const tasks = [done('es', '2026-10-07'), log('a', '2026-10-06', '23:00', '01:00', { sourceTaskId: 'es' })]
    expect(loggedMinutesForTask(tasks, 'es', TODAY)).toBe(120)
  })

  it('題名を直しても組のまま（sourceTaskId が正）', () => {
    const tasks = [
      done('es', '2026-10-07', { title: 'ES 書く（第一志望）' }),
      log('a', '2026-10-07', '10:00', '10:30', { title: 'ES', sourceTaskId: 'es' }),
    ]
    expect(loggedMinutesForTask(tasks, 'es', TODAY)).toBe(30)
  })

  it('元の To-Do を消した記録は、同じ題名の別の To-Do にも足さない', () => {
    const tasks = [
      done('other', '2026-10-07', { title: 'ES' }),
      log('a', '2026-10-07', '10:00', '10:30', { title: 'ES', sourceTaskId: 'gone' }),
    ]
    expect(loggedMinutesByTask(tasks, TODAY).size).toBe(0)
  })

  it('睡眠・削除した記録・子の記録は数えない', () => {
    const tasks = [
      done('es', '2026-10-07'),
      log('del', '2026-10-07', '10:00', '11:00', { sourceTaskId: 'es', deletedAt: '2026-10-07T05:00:00Z' }),
      log('child', '2026-10-07', '12:00', '13:00', { sourceTaskId: 'es', parentId: 'x' }),
      task('sleep', { kind: 'sleep', dueDate: '2026-10-07', startTime: '23:00', endTime: '07:00', sourceTaskId: 'es' }),
    ]
    expect(loggedMinutesByTask(tasks, TODAY).size).toBe(0)
  })
})

describe('loggedMinutesByTask: 元の To-Do を覚えていない前の記録（題名で控えめに）', () => {
  it('題名が完全に同じで、作った日〜完了した日の記録なら結ぶ', () => {
    const tasks = [
      done('es', '2026-10-07', { title: 'ES 書く', createdAt: '2026-10-05T12:00:00Z' }),
      log('a', '2026-10-06', '10:00', '11:00', { title: ' ES 書く ' }),
    ]
    expect(loggedMinutesForTask(tasks, 'es', TODAY)).toBe(60)
  })

  it('作る前・完了した後の記録は結ばない', () => {
    const tasks = [
      done('es', '2026-10-07', { title: 'ES 書く', createdAt: '2026-10-05T12:00:00Z' }),
      log('before', '2026-10-04', '10:00', '11:00', { title: 'ES 書く' }),
      log('after', '2026-10-08', '10:00', '11:00', { title: 'ES 書く' }),
    ]
    expect(loggedMinutesForTask(tasks, 'es', TODAY)).toBe(0)
  })

  it('未完了の To-Do は今日までの記録を結ぶ', () => {
    const tasks = [task('es', { title: 'ES 書く' }), log('a', TODAY, '10:00', '10:45', { title: 'ES 書く' })]
    expect(loggedMinutesForTask(tasks, 'es', TODAY)).toBe(45)
  })

  it('同じ題名の To-Do が 2 つ以上（繰り返しの回など）なら、どれにも結ばない', () => {
    const tasks = [
      done('w1', '2026-10-05', { title: 'シフト提出' }),
      task('w2', { title: 'シフト提出' }),
      log('a', '2026-10-05', '10:00', '10:15', { title: 'シフト提出' }),
    ]
    expect(loggedMinutesByTask(tasks, TODAY).size).toBe(0)
  })

  it('題名が少し違うだけでも結ばない（似ているかでは決めない）', () => {
    const tasks = [done('es', '2026-10-07', { title: 'ES 書く' }), log('a', '2026-10-06', '10:00', '11:00', { title: 'ES 書く（続き）' })]
    expect(loggedMinutesForTask(tasks, 'es', TODAY)).toBe(0)
  })

  it('習慣の記録は題名が同じでも結ばない', () => {
    const tasks = [done('gym', '2026-10-07', { title: 'ジム' }), log('a', '2026-10-06', '19:00', '20:00', { title: 'ジム', habitId: 'h1' })]
    expect(loggedMinutesForTask(tasks, 'gym', TODAY)).toBe(0)
  })
})

describe('getEstimateRows: 週のふりかえり', () => {
  // 2026-10-05 (月) 〜 10-11 (日) の週、今日は 10-08 (木)
  const now = new Date('2026-10-08T13:00:00')
  const anchor = new Date('2026-10-08T12:00:00')

  it('この週に完了し、見積もりと記録があるものを、超えた分の大きい順に', () => {
    const tasks = [
      done('es', '2026-10-06', { title: 'ES', estimateMinutes: 60 }),
      log('es1', '2026-10-06', '10:00', '12:00', { sourceTaskId: 'es' }),
      done('report', '2026-10-07', { title: 'レポート', estimateMinutes: 90 }),
      log('r1', '2026-10-07', '13:00', '14:00', { sourceTaskId: 'report' }),
      done('mail', '2026-10-07', { title: 'メール', estimateMinutes: 15 }),
      log('m1', '2026-10-07', '15:00', '15:30', { sourceTaskId: 'mail' }),
    ]
    const rows = getEstimateRows(tasks, anchor, new Set(), now)
    expect(rows.map((r) => [r.task.id, r.estimateMinutes, r.loggedMinutes])).toEqual([
      ['es', 60, 120],
      ['mail', 15, 30],
      ['report', 90, 60],
    ])
  })

  it('棒の色に使う記録は、結び付いた記録のうちいちばん長いもの', () => {
    const tasks = [
      done('es', '2026-10-06', { estimateMinutes: 60 }),
      log('short', '2026-10-05', '10:00', '10:20', { sourceTaskId: 'es', category: '授業' }),
      log('long', '2026-10-06', '10:00', '11:00', { sourceTaskId: 'es', category: '就活' }),
    ]
    expect(getEstimateRows(tasks, anchor, new Set(), now)[0]?.mainLog.id).toBe('long')
  })

  it('前の週の記録も、この週に完了した To-Do の時間に足す', () => {
    const tasks = [
      done('es', '2026-10-06', { estimateMinutes: 60 }),
      log('old', '2026-10-02', '10:00', '11:00', { sourceTaskId: 'es' }),
      log('new', '2026-10-06', '10:00', '10:30', { sourceTaskId: 'es' }),
    ]
    expect(getEstimateRows(tasks, anchor, new Set(), now)[0]?.loggedMinutes).toBe(90)
  })

  it('未完了・別の週に完了・見積もり無し・記録無し・除いたリストは出さない', () => {
    const tasks = [
      task('open', { estimateMinutes: 60 }),
      log('o1', '2026-10-06', '10:00', '11:00', { sourceTaskId: 'open' }),
      done('lastWeek', '2026-10-02', { estimateMinutes: 60 }),
      log('l1', '2026-10-02', '10:00', '11:00', { sourceTaskId: 'lastWeek' }),
      done('noEstimate', '2026-10-06'),
      log('n1', '2026-10-06', '10:00', '11:00', { sourceTaskId: 'noEstimate' }),
      done('noLog', '2026-10-06', { estimateMinutes: 60 }),
      done('someday', '2026-10-06', { estimateMinutes: 60, listId: 'someday' }),
      log('s1', '2026-10-06', '10:00', '11:00', { sourceTaskId: 'someday' }),
    ]
    expect(getEstimateRows(tasks, anchor, new Set(['someday']), now)).toEqual([])
  })
})

describe('getEstimateRows: 月のふりかえり（#304）', () => {
  const now = new Date('2026-10-08T13:00:00')
  const anchor = new Date('2026-10-08T12:00:00')

  it('この月（1 日〜今日）に完了したものを出し、前の月に完了したものは出さない', () => {
    const tasks = [
      done('oct1', '2026-10-01', { estimateMinutes: 60 }),
      log('a', '2026-10-01', '10:00', '11:00', { sourceTaskId: 'oct1' }),
      done('sep30', '2026-09-30', { estimateMinutes: 60 }),
      log('b', '2026-09-30', '10:00', '11:00', { sourceTaskId: 'sep30' }),
    ]
    expect(getEstimateRows(tasks, anchor, new Set(), now, 'month').map((r) => r.task.id)).toEqual(['oct1'])
    const sep = getEstimateRows(tasks, new Date('2026-09-15T12:00:00'), new Set(), now, 'month')
    expect(sep.map((r) => r.task.id)).toEqual(['sep30'])
  })
})
