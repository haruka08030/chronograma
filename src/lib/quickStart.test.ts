import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import type { ActiveTimer } from '../store/storeTypes'
import { lastLogSeed, parseStartParam, quickStartReady, runQuickStart } from './quickStart'
import { TASK_DEFAULTS } from './taskDefaults'

function task(over: Partial<Task>): Task {
  return {
    ...TASK_DEFAULTS,
    id: Math.random().toString(36).slice(2),
    title: 't',
    description: '',
    completed: true,
    completedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
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
  }
}

const log = (over: Partial<Task>) => task({ kind: 'log', ...over })

describe('parseStartParam', () => {
  it('reads only "last"', () => {
    expect(parseStartParam('last')).toBe('last')
    expect(parseStartParam(' LAST ')).toBe('last')
    expect(parseStartParam(null)).toBeNull()
    expect(parseStartParam('')).toBeNull()
    expect(parseStartParam('勉強')).toBeNull()
  })
})

describe('lastLogSeed（前回の記録）', () => {
  it('終わりがいちばん新しい記録の題名・ラベル・色・元の To-Do を写す', () => {
    const todo = task({ id: 'todo1', title: 'ES を書く', completed: false })
    const tasks = [
      todo,
      log({ title: '英語', category: '勉強', dueDate: '2026-10-05', startTime: '09:00', endTime: '10:00' }),
      log({
        title: 'ES',
        category: '就活',
        color: '#ff8800',
        sourceTaskId: 'todo1',
        dueDate: '2026-10-05',
        startTime: '13:00',
        endTime: '14:00',
      }),
      log({ title: '読書', dueDate: '2026-10-04', startTime: '20:00', endTime: '21:00' }),
    ]
    expect(lastLogSeed(tasks)).toEqual({ title: 'ES', tags: ['就活'], taskId: 'todo1', color: '#ff8800' })
  })

  it('日をまたぐ記録は終わりの日で比べる', () => {
    const tasks = [
      log({ title: '夜の作業', dueDate: '2026-10-04', endDate: '2026-10-05', startTime: '23:00', endTime: '01:00' }),
      log({ title: '前日の昼', dueDate: '2026-10-04', startTime: '12:00', endTime: '13:00' }),
    ]
    expect(lastLogSeed(tasks)?.title).toBe('夜の作業')
  })

  it('睡眠・ゴミ箱の記録・題名の無い記録・To-Do は前回の記録にしない', () => {
    const tasks = [
      task({ title: 'To-Do', completed: false, dueDate: '2026-10-06', startTime: '10:00', endTime: '11:00' }),
      log({ title: '睡眠', kind: 'sleep', dueDate: '2026-10-06', startTime: '00:00', endTime: '07:00' }),
      log({ title: '消した', deletedAt: '2026-10-06T00:00:00.000Z', dueDate: '2026-10-06', startTime: '08:00', endTime: '09:00' }),
      log({ title: '  ', dueDate: '2026-10-06', startTime: '09:00', endTime: '09:30' }),
      log({ title: '散歩', dueDate: '2026-10-05', startTime: '18:00', endTime: '18:30' }),
    ]
    expect(lastLogSeed(tasks)).toEqual({ title: '散歩', tags: [], taskId: null, color: null })
  })

  it('元の To-Do が消えていれば元は付けない', () => {
    const tasks = [
      task({ id: 'gone', title: 'ES', completed: false, deletedAt: '2026-10-06T00:00:00.000Z' }),
      log({ title: 'ES', sourceTaskId: 'gone', dueDate: '2026-10-05', startTime: '13:00', endTime: '14:00' }),
    ]
    expect(lastLogSeed(tasks)?.taskId).toBeNull()
    expect(lastLogSeed([log({ title: 'ES', sourceTaskId: 'missing', dueDate: '2026-10-05', startTime: '13:00' })])?.taskId).toBeNull()
  })

  it('記録が無ければ null', () => {
    expect(lastLogSeed([])).toBeNull()
    expect(lastLogSeed([task({ title: 'To-Do', completed: false })])).toBeNull()
  })
})

describe('runQuickStart', () => {
  const running: ActiveTimer = { taskTitle: '数学', startedAt: '2026-10-06T00:00:00.000Z', tags: [], taskId: null, color: null }
  const tasks = [log({ title: 'ES', category: '就活', dueDate: '2026-10-05', startTime: '13:00', endTime: '14:00' })]

  it('前回の記録で始める', () => {
    const startTimer = vi.fn()
    expect(runQuickStart({ tasks, activeTimer: null, startTimer })).toEqual({ kind: 'started', title: 'ES' })
    expect(startTimer).toHaveBeenCalledWith('ES', ['就活'], null, null)
  })

  it('計測中なら新しく始めない（二重に始めない）', () => {
    const startTimer = vi.fn()
    expect(runQuickStart({ tasks, activeTimer: running, startTimer })).toEqual({ kind: 'running', title: '数学' })
    expect(startTimer).not.toHaveBeenCalled()
  })

  it('前回の記録が無ければ何も始めない', () => {
    const startTimer = vi.fn()
    expect(runQuickStart({ tasks: [], activeTimer: null, startTimer })).toEqual({ kind: 'none' })
    expect(startTimer).not.toHaveBeenCalled()
  })
})

describe('quickStartReady', () => {
  const base = { authLoading: false, signedIn: true, lastSyncedAt: null, syncState: 'idle' as const, timedOut: false }

  it('ログインしていなければすぐ', () => {
    expect(quickStartReady({ ...base, signedIn: false })).toBe(true)
  })

  it('ログイン中は最初の同期が終わるか失敗するまで待つ', () => {
    expect(quickStartReady(base)).toBe(false)
    expect(quickStartReady({ ...base, syncState: 'syncing' })).toBe(false)
    expect(quickStartReady({ ...base, lastSyncedAt: '2026-10-06T00:00:00.000Z' })).toBe(true)
    expect(quickStartReady({ ...base, syncState: 'error' })).toBe(true)
    expect(quickStartReady({ ...base, syncState: 'outdated' })).toBe(true)
  })

  it('ログインの確認中は待ち、待ちきれなければ手元で決める', () => {
    expect(quickStartReady({ ...base, authLoading: true, signedIn: false })).toBe(false)
    expect(quickStartReady({ ...base, timedOut: true })).toBe(true)
    expect(quickStartReady({ ...base, authLoading: true, timedOut: true })).toBe(true)
  })
})
