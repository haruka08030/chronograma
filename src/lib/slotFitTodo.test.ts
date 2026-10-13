import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { makeTask } from '../store/taskHelpers'
import { pickTodoForSlot } from './slotFitTodo'

const DAY = '2026-10-13'
const SOMEDAY = 'someday'

function todo(id: string, fields: Partial<Parameters<typeof makeTask>[0]> & { parentId?: string }, order = 0): Task {
  const { parentId, ...rest } = fields
  return { ...makeTask({ title: id, listId: 'inbox', ...rest }, order), id, parentId: parentId ?? null }
}

const pick = (tasks: Task[], minutes = 60) => pickTodoForSlot(tasks, DAY, minutes, new Set([SOMEDAY]))?.id ?? null

describe('pickTodoForSlot', () => {
  it('picks a to-do whose estimate fits the slot', () => {
    expect(pick([todo('a', { estimateMinutes: 45, dueDate: '2026-10-14' })])).toBe('a')
  })

  it('shows nothing when no estimate fits (too long, or none)', () => {
    expect(pick([todo('long', { estimateMinutes: 90 }), todo('none', {})])).toBeNull()
  })

  it('leaves out someday / checklist lists, events, logs, done, timed and sub-tasks', () => {
    expect(
      pick([
        todo('someday', { estimateMinutes: 30, listId: SOMEDAY }),
        todo('event', { estimateMinutes: 30, kind: 'event' }),
        todo('log', { estimateMinutes: 30, kind: 'log' }),
        todo('done', { estimateMinutes: 30, completed: true }),
        todo('timed', { estimateMinutes: 30, scheduledDate: DAY, startTime: '09:00', endTime: '09:30' }),
        todo('sub', { estimateMinutes: 30, parentId: 'x' }),
        todo('later', { estimateMinutes: 30, scheduledDate: '2026-10-20' }),
      ]),
    ).toBeNull()
  })

  it('orders by nearest due, then the day’s own rows, then list order', () => {
    expect(pick([todo('noDue', { estimateMinutes: 30 }), todo('due', { estimateMinutes: 30, dueDate: '2026-10-20' })])).toBe('due')
    expect(
      pick([todo('later', { estimateMinutes: 30, dueDate: '2026-10-20' }), todo('soon', { estimateMinutes: 30, dueDate: '2026-10-14' })]),
    ).toBe('soon')
    expect(pick([todo('undated', { estimateMinutes: 30 }, 0), todo('today', { estimateMinutes: 30, scheduledDate: DAY }, 1)])).toBe('today')
    expect(pick([todo('second', { estimateMinutes: 30 }, 2), todo('first', { estimateMinutes: 30 }, 1)])).toBe('first')
  })
})
