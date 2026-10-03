import { describe, expect, it } from 'vitest'
import { parseBackupJson, withFreshStamps } from './backupFormat'

const file = (data: Record<string, unknown>) => JSON.stringify({ version: 3, ...data })

describe('parseBackupJson', () => {
  it('fills in fields a hand-edited or old file left out, so screens do not crash', () => {
    const parsed = parseBackupJson(
      file({
        lists: [{ id: '__inbox__', name: '未分類' }],
        tasks: [{ id: 't1', title: '課題', listId: '__inbox__', dueDate: 'tomorrow', startTime: 9, recurrence: { type: 'hourly' } }],
        habits: [{ id: 'h1', title: 'ジム', completedDates: ['2026-10-01', 3, 'x'], frequency: { type: 'weekly', weekdays: [1, 9] } }],
      }),
    )
    expect(parsed).not.toBeNull()
    const t = parsed!.tasks[0]
    expect(t.tags).toEqual([])
    expect(t.description).toBe('')
    expect(t.completed).toBe(false)
    expect(t.dueDate).toBeNull()
    expect(t.startTime).toBeNull()
    expect(t.recurrence).toBeNull()
    expect(Number.isFinite(Date.parse(t.updatedAt))).toBe(true)
    const h = parsed!.habits[0]
    expect(h.completedDates).toEqual(['2026-10-01'])
    expect(h.frequency).toEqual({ type: 'weekly', weekdays: [1] })
    expect(Number.isFinite(Date.parse(h.updatedAt))).toBe(true)
  })

  it('keeps valid values as they are', () => {
    const parsed = parseBackupJson(
      file({
        lists: [{ id: '__inbox__', name: '未分類' }],
        tasks: [{
          id: 't1', title: 'ES', listId: '__inbox__', tags: ['就活'], dueDate: '2026-10-05', dueTime: '18:00',
          recurrence: { type: 'weekly', interval: 2 }, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
        }],
      }),
    )
    const t = parsed!.tasks[0]
    expect(t.tags).toEqual(['就活'])
    expect(t.dueDate).toBe('2026-10-05')
    expect(t.dueTime).toBe('18:00')
    expect(t.recurrence).toEqual({ type: 'weekly', interval: 2 })
    expect(t.updatedAt).toBe('2026-10-02T00:00:00.000Z')
  })
})

describe('withFreshStamps', () => {
  it('marks every imported row as edited now so sync does not prefer older server rows', () => {
    const parsed = parseBackupJson(
      file({
        lists: [{ id: '__inbox__', name: '未分類' }],
        tasks: [{ id: 't1', title: 'ES', listId: '__inbox__', updatedAt: '2020-01-01T00:00:00.000Z' }],
      }),
    )!
    const before = Date.now()
    const fresh = withFreshStamps(parsed)
    expect(Date.parse(fresh.tasks[0].updatedAt)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(fresh.lists[0].updatedAt!)).toBeGreaterThanOrEqual(before)
  })
})
