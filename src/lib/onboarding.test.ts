import { describe, expect, it } from 'vitest'
import type { Task } from '../types/task'
import { allOnboardingStepsDone, hasExistingData, onboardingSteps } from './onboarding'

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'a',
    title: 'レポート',
    kind: 'todo',
    startTime: null,
    endTime: null,
    archivedAt: null,
    deletedAt: null,
    ...over,
  } as Task
}

describe('はじめの 3 ステップの判定', () => {
  it('何も無ければ 1 つも済んでいない', () => {
    expect(onboardingSteps([], false)).toEqual({ added: false, placed: false, recorded: false })
  })

  it('To-Do を入れたら ①、時間帯があれば ②', () => {
    expect(onboardingSteps([task()], false)).toEqual({ added: true, placed: false, recorded: false })
    expect(onboardingSteps([task({ startTime: '15:00', endTime: '16:00' })], false)).toEqual({
      added: true,
      placed: true,
      recorded: false,
    })
  })

  it('記録があるか、タイマーが動いていれば ③（睡眠は数えない）', () => {
    expect(onboardingSteps([task({ kind: 'log' } as Partial<Task>)], false).recorded).toBe(true)
    expect(onboardingSteps([task({ kind: 'sleep' } as Partial<Task>)], false).recorded).toBe(false)
    expect(onboardingSteps([], true).recorded).toBe(true)
  })

  it('ゴミ箱・アーカイブのタスクは数えない', () => {
    expect(onboardingSteps([task({ deletedAt: '2026-10-01T00:00:00Z' })], false).added).toBe(false)
    expect(onboardingSteps([task({ archivedAt: '2026-10-01T00:00:00Z' })], false).added).toBe(false)
  })

  it('3 つそろったら終わり', () => {
    const steps = onboardingSteps([task({ startTime: '15:00', endTime: '16:00' })], true)
    expect(allOnboardingStepsDone(steps)).toBe(true)
    expect(allOnboardingStepsDone({ ...steps, recorded: false })).toBe(false)
  })
})

describe('すでに使っている人か', () => {
  it('タスクか習慣があれば使っている', () => {
    expect(hasExistingData({ tasks: [], habits: [] })).toBe(false)
    expect(hasExistingData({})).toBe(false)
    expect(hasExistingData({ tasks: [{}] })).toBe(true)
    expect(hasExistingData({ habits: [{}] })).toBe(true)
  })
})
