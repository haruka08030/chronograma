import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { getWeekReview } from './weekReview'
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
    const log = task('log', { title: 'ゼミ', isTimeLog: true, dueDate: '2026-10-03', startTime: '15:00', endTime: '15:40' })
    const review = getWeekReview([...tasks, log], [], at('15:45'), new Set(), at('15:45'))
    expect(review.timedPlanned).toBe(1)
    expect(review.followRate).toBe(1)
  })
})
