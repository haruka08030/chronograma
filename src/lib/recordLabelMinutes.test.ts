import { describe, expect, it } from 'vitest'
import { makeTask } from '../store/taskHelpers'
import { INBOX_LIST_ID } from '../store/storeConstants'
import type { Task } from '../types/task'
import { minutesByRecordLabel } from './recordLabelMinutes'

const DAY = '2026-10-21'
const log = (label: string, startTime: string, endTime: string, over: Partial<Task> = {}): Task => ({
  ...makeTask({ title: label, listId: INBOX_LIST_ID }, 0),
  id: `${label}-${startTime}`,
  kind: 'log',
  dueDate: DAY,
  startTime,
  endTime,
  completed: true,
  category: label,
  ...over,
})
const byLabel = (log: Task) => log.category ?? ''

describe('minutesByRecordLabel', () => {
  it('重なった時間は 2 回数えず、あとから始まった記録に入れる', () => {
    const r = minutesByRecordLabel([log('就活', '17:00', '19:00'), log('移動', '18:00', '18:30')], DAY, byLabel)
    expect(r.totalMinutes).toBe(120)
    expect(r.byCategory).toEqual([
      ['就活', 90],
      ['移動', 30],
    ])
  })

  it('睡眠は入れず、日をまたぐ記録はその日の分だけ', () => {
    const r = minutesByRecordLabel(
      [
        log('睡眠', '23:30', '07:00', { kind: 'sleep', dueDate: '2026-10-20', endDate: DAY }),
        log('dev', '23:00', '01:00', { endDate: '2026-10-22' }),
      ],
      DAY,
      byLabel,
    )
    expect(r.byCategory).toEqual([['dev', 60]])
  })
})
