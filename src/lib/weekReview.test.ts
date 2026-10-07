import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { foldLabelMinutes, getWeekReview, loggedMinutesVsPrevWeek } from './weekReview'
import { TASK_DEFAULTS } from './taskDefaults'

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

// 2026-10-03 (土)
const at = (hm: string) => new Date(`2026-10-03T${hm}:00`)

describe('getWeekReview followRate', () => {
  const tasks = [task('ゼミ', { scheduledDate: '2026-10-03', startTime: '15:00', endTime: '16:30' })]

  it('does not judge a plan that has not ended yet', () => {
    const review = getWeekReview(tasks, [], at('00:30'), new Set(), at('00:30'))
    expect(review.timedPlanned).toBe(0)
    expect(review.followRate).toBeNull()
  })

  it('counts the plan once its time has passed', () => {
    const review = getWeekReview(tasks, [], at('17:00'), new Set(), at('17:00'))
    expect(review.timedPlanned).toBe(1)
    expect(review.followRate).toBe(0)
  })

  it('counts a plan already recorded before it ends', () => {
    const log = task('log', { title: 'ゼミ', kind: 'log', dueDate: '2026-10-03', startTime: '15:00', endTime: '15:40' })
    const review = getWeekReview([...tasks, log], [], at('15:45'), new Set(), at('15:45'))
    expect(review.timedPlanned).toBe(1)
    expect(review.followRate).toBe(1)
    expect(review.followed).toBe(1)
  })
})

describe('foldLabelMinutes', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ tag: `l${i}`, minutes: 60 - i }))

  it('6 件までは全部出す', () => {
    expect(foldLabelMinutes(rows(6))).toEqual({ shown: rows(6), others: 0 })
  })

  it('7 件以上は上位 5 件と「その他」', () => {
    const { shown, others } = foldLabelMinutes(rows(8))
    expect(shown.map((x) => x.tag)).toEqual(['l0', 'l1', 'l2', 'l3', 'l4'])
    expect(others).toBe(55 + 54 + 53)
  })
})

describe('loggedMinutesVsPrevWeek', () => {
  const log = (id: string, date: string, start: string, end: string) =>
    task(id, { kind: 'log', dueDate: date, startTime: start, endTime: end })
  // 今週（9/28〜）は土曜 10/03 まで。前の週は同じ土曜 9/26 までで比べる
  const tasks = [
    log('this', '2026-10-01', '10:00', '11:40'),
    log('prevTue', '2026-09-22', '10:00', '11:00'),
    log('prevSun', '2026-09-27', '10:00', '15:00'),
  ]

  it('前の週の同じ曜日までと比べる', () => {
    const now = at('20:00')
    const review = getWeekReview(tasks, [], now, new Set(), now)
    expect(review.loggedMinutes).toBe(100)
    expect(loggedMinutesVsPrevWeek(review.loggedMinutes, tasks, [], now, new Set(), now)).toBe(40)
  })

  it('過ぎた週どうしは丸ごと比べる', () => {
    const now = at('20:00')
    const anchor = new Date('2026-09-23T12:00:00')
    const review = getWeekReview(tasks, [], anchor, new Set(), now)
    expect(review.loggedMinutes).toBe(360)
    // 前の週（9/14〜）は記録なし
    expect(loggedMinutesVsPrevWeek(review.loggedMinutes, tasks, [], anchor, new Set(), now)).toBeNull()
    const next = new Date('2026-10-01T12:00:00')
    expect(loggedMinutesVsPrevWeek(0, tasks, [], next, new Set(), new Date('2026-10-10T12:00:00'))).toBe(-360)
  })

  it('前の週に記録が無ければ null', () => {
    const now = at('20:00')
    expect(loggedMinutesVsPrevWeek(100, [tasks[0]], [], now, new Set(), now)).toBeNull()
  })
})
