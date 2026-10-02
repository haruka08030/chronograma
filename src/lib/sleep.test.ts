import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { defaultSleepTimes, looksLikeSleep, sleepEndingOn, sleepMinutes, sleepSpan, summarizeSleep, wakeDateOf } from './sleep'
import { getDayPlan } from './dayPlan'

const log = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: id,
  description: '',
  completed: true,
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
  isTimeLog: true,
  ...over,
})

describe('sleepSpan', () => {
  it('starts the night before when bedtime is after wake time', () => {
    expect(sleepSpan('2026-09-30', '23:30', '07:00')).toEqual({ dueDate: '2026-09-29', endDate: '2026-09-30' })
  })
  it('stays on the wake day when going to bed after midnight', () => {
    expect(sleepSpan('2026-09-30', '01:00', '08:00')).toEqual({ dueDate: '2026-09-30', endDate: null })
  })
})

describe('sleepMinutes', () => {
  it('counts across midnight', () => {
    expect(sleepMinutes('23:30', '07:00')).toBe(450)
    expect(sleepMinutes('01:00', '08:00')).toBe(420)
  })
})

describe('wakeDateOf / sleepEndingOn', () => {
  const night = log('n', { isSleep: true, dueDate: '2026-09-29', endDate: '2026-09-30', startTime: '23:30', endTime: '07:00' })
  const legacy = log('l', { isSleep: true, dueDate: '2026-09-28', startTime: '23:00', endTime: '06:30' })
  const late = log('a', { isSleep: true, dueDate: '2026-09-27', startTime: '02:00', endTime: '09:00' })

  it('reads the wake day from endDate, or from times that wrap past midnight', () => {
    expect(wakeDateOf(night)).toBe('2026-09-30')
    expect(wakeDateOf(legacy)).toBe('2026-09-29')
    expect(wakeDateOf(late)).toBe('2026-09-27')
  })
  it('finds the sleep that ended on that morning only', () => {
    const tasks = [night, legacy, late, log('x', { dueDate: '2026-09-30', startTime: '09:00', endTime: '10:00' })]
    expect(sleepEndingOn(tasks, '2026-09-30')?.id).toBe('n')
    expect(sleepEndingOn(tasks, '2026-09-29')?.id).toBe('l')
    expect(sleepEndingOn(tasks, '2026-10-01')).toBeNull()
  })
  it('ignores deleted sleep', () => {
    expect(sleepEndingOn([{ ...night, deletedAt: '2026-09-30T08:00:00Z' }], '2026-09-30')).toBeNull()
  })
  it('defaults to the latest sleep times', () => {
    expect(defaultSleepTimes([legacy, night, late])).toEqual({ bed: '23:30', wake: '07:00' })
    expect(defaultSleepTimes([])).toEqual({ bed: '23:30', wake: '07:00' })
  })
})

describe('looksLikeSleep', () => {
  it('matches the title or the label', () => {
    expect(looksLikeSleep(log('睡眠'))).toBe(true)
    expect(looksLikeSleep(log(' Sleep '))).toBe(true)
    expect(looksLikeSleep(log('夜', { tags: ['睡眠'] }))).toBe(true)
  })
  it('leaves other records and plans alone', () => {
    expect(looksLikeSleep(log('睡眠学習の課題'))).toBe(false)
    expect(looksLikeSleep(log('昼寝'))).toBe(false)
    expect(looksLikeSleep(log('睡眠', { isTimeLog: false }))).toBe(false)
  })
})

describe('getDayPlan', () => {
  it('leaves sleep out of the logged time', () => {
    const tasks = [
      log('n', { isSleep: true, dueDate: '2026-09-30', startTime: '00:30', endTime: '07:00' }),
      log('study', { dueDate: '2026-09-30', startTime: '09:00', endTime: '10:30' }),
    ]
    expect(getDayPlan(tasks, '2026-09-30').loggedMinutes).toBe(90)
  })
})

describe('summarizeSleep', () => {
  const night = (id: string, bedDay: string, wakeDay: string | null, bed: string, wake: string) =>
    log(id, { isSleep: true, dueDate: bedDay, endDate: wakeDay, startTime: bed, endTime: wake })

  it('averages bedtimes across midnight and lists missing days as null', () => {
    const tasks = [
      night('a', '2026-09-28', '2026-09-29', '23:30', '07:00'),
      night('b', '2026-09-30', null, '00:30', '08:00'),
    ]
    const s = summarizeSleep(tasks, '2026-10-01', 4)
    expect(s.nights.map((n) => n?.dateKey ?? null)).toEqual([null, '2026-09-29', '2026-09-30', null])
    expect(s.count).toBe(2)
    expect(s.avgMinutes).toBe(450)
    expect(s.avgBed).toBe('00:00')
    expect(s.avgWake).toBe('07:30')
    expect(s.bedSpread).toBe(30)
    expect(s.wakeSpread).toBe(30)
  })
  it('is empty without sleep', () => {
    const s = summarizeSleep([], '2026-10-01', 7)
    expect(s.count).toBe(0)
    expect(s.avgBed).toBeNull()
    expect(s.nights).toHaveLength(7)
  })
})
