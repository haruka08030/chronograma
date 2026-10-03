import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { planTiming } from './planTiming'

const plan = (over: Partial<Task>): Task =>
  ({ kind: 'task', completed: false, scheduledDate: '2026-10-03', dueDate: null, endDate: null, startTime: '10:00', endTime: '11:00', ...over }) as Task

const at = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00`)

describe('planTiming().ended', () => {
  it('終わりの時刻までは終わっていない', () => {
    expect(planTiming(plan({}), at('2026-10-03', '10:59')).ended).toBe(false)
  })
  it('終わりの時刻を過ぎたら終わり', () => {
    expect(planTiming(plan({}), at('2026-10-03', '11:00')).ended).toBe(true)
    expect(planTiming(plan({}), at('2026-10-04', '09:00')).ended).toBe(true)
  })
  it('日をまたぐ予定は終わりの日の時刻で終わる', () => {
    const overnight = plan({ startTime: '23:00', endTime: '01:00', endDate: '2026-10-04' })
    expect(planTiming(overnight, at('2026-10-03', '23:30')).ended).toBe(false)
    expect(planTiming(overnight, at('2026-10-04', '00:30')).ended).toBe(false)
    expect(planTiming(overnight, at('2026-10-04', '01:00')).ended).toBe(true)
  })
})
