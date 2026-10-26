import { describe, expect, it } from 'vitest'
import { readHabitPastRules, type Habit } from '../types/habit'
import { createdPastRules, pastRulesAfterEdit } from './habitPastRules'
import { isHabitScheduledOnDate } from './habitSchedule'
import { habitToPlannedItem } from './habitSlots'
import { buildHabitRecordIndex, habitDayStatus } from './habitTiming'
import { fromDateKey } from './dateKey'
import { normalizeHabitRow } from './backupFormat'
import { habitFromRow } from '../../supabase/functions/daily-reminders/wrapUp'
import type { Task } from '../types/task'

const OLD = '2026-01-01T00:00:00.000Z'
const YESTERDAY = '2026-10-23'
const TODAY = '2026-10-24'

function habit(patch: Partial<Habit> = {}): Habit {
  return {
    id: 'h',
    title: '散歩',
    color: '#33B679',
    timeMode: 'fixed',
    startTime: '07:00',
    endTime: null,
    frequency: { type: 'daily' },
    createdAt: OLD,
    updatedAt: OLD,
    completedDates: [],
    archivedAt: null,
    ...patch,
  }
}

function log(dueDate: string, startTime: string, endTime: string): Task {
  return {
    id: `log-${dueDate}`,
    title: '散歩',
    kind: 'log',
    dueDate,
    startTime,
    endTime,
    completed: true,
    createdAt: OLD,
    updatedAt: OLD,
  } as unknown as Task
}

describe('作った日より前は変えない', () => {
  it('作った日より前は予定の日に入らず、枠も出さない', () => {
    const h = habit({ pastRules: createdPastRules(TODAY) })
    expect(isHabitScheduledOnDate(h, fromDateKey(YESTERDAY))).toBe(false)
    expect(habitToPlannedItem(h, YESTERDAY)).toBeNull()
    expect(isHabitScheduledOnDate(h, fromDateKey(TODAY))).toBe(true)
    expect(habitToPlannedItem(h, TODAY)).not.toBeNull()
  })
})

describe('設定を変えても前の日は前の設定のまま', () => {
  it('時間を変えた日より前は、前の時間で判定する', () => {
    const before = habit()
    const after = { ...before, startTime: '09:00' }
    after.pastRules = pastRulesAfterEdit(before, after, TODAY)
    const records = buildHabitRecordIndex([log(YESTERDAY, '07:00', '07:30'), log(TODAY, '09:00', '09:30')])
    expect(habitDayStatus(after, YESTERDAY, records)).toBe('done')
    expect(habitDayStatus(after, TODAY, records)).toBe('done')
    expect(habitToPlannedItem(after, YESTERDAY)?.startTime).toBe('07:00')
    expect(habitToPlannedItem(after, TODAY)?.startTime).toBe('09:00')
  })

  it('時間に幅を持たせても、前の日は時刻ひとつの判定のまま', () => {
    const before = habit()
    const after: Habit = { ...before, timeMode: 'range', endTime: '07:30' }
    after.pastRules = pastRulesAfterEdit(before, after, TODAY)
    const records = buildHabitRecordIndex([log(YESTERDAY, '07:00', '08:30')])
    expect(habitDayStatus(after, YESTERDAY, records)).toBe('done')
  })

  it('頻度を変えた日より前は、前の曜日で予定の日を決める', () => {
    const before = habit({ frequency: { type: 'weekly', weekdays: [6] } })
    const after: Habit = { ...before, frequency: { type: 'daily' } }
    after.pastRules = pastRulesAfterEdit(before, after, TODAY)
    // 10/22 は木曜、10/24 は土曜
    expect(isHabitScheduledOnDate(after, fromDateKey('2026-10-22'))).toBe(false)
    expect(isHabitScheduledOnDate(after, fromDateKey(TODAY))).toBe(true)
  })

  it('同じ日に何度変えても、その日の最初の前の設定を残す', () => {
    const first = habit()
    const second = { ...first, startTime: '08:00' }
    second.pastRules = pastRulesAfterEdit(first, second, TODAY)
    const third = { ...second, startTime: '09:00' }
    third.pastRules = pastRulesAfterEdit(second, third, TODAY)
    expect(third.pastRules).toEqual([{ until: TODAY, timeMode: 'fixed', startTime: '07:00', endTime: null, frequency: { type: 'daily' } }])
  })

  it('作った日に変えたら前の設定は残さない', () => {
    const before = habit({ pastRules: createdPastRules(TODAY) })
    const after = { ...before, startTime: '09:00' }
    expect(pastRulesAfterEdit(before, after, TODAY)).toEqual(createdPastRules(TODAY))
  })

  it('名前や色だけ変えたら前の設定を残さない', () => {
    const before = habit()
    expect(pastRulesAfterEdit(before, { ...before, title: '朝の散歩' }, TODAY)).toBeUndefined()
  })
})

describe('前の日の設定の読み込み', () => {
  const rules = [
    { until: TODAY, timeMode: 'fixed', startTime: '07:00', endTime: null, frequency: { type: 'daily' } },
    { until: '2026-10-01', off: true },
  ]

  it('壊れた項目を捨てて古い順に並べる', () => {
    expect(readHabitPastRules([...rules, { until: 'x' }, 3])).toEqual([rules[1], rules[0]])
    expect(readHabitPastRules([])).toBeUndefined()
  })

  it('バックアップと Edge Function も同じに読む', () => {
    expect(normalizeHabitRow({ ...habit(), pastRules: rules })?.pastRules).toEqual([rules[1], rules[0]])
    const row = habitFromRow({ id: 'h', title: '散歩', time_mode: 'fixed', start_time: '09:00', past_rules: rules })
    expect(row?.pastRules?.map((r) => r.until)).toEqual(['2026-10-01', TODAY])
  })
})
