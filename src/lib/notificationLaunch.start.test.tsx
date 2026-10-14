import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { TASK_DEFAULTS } from './taskDefaults'
import { closeTaskDetail, useOverlays } from './overlays'
import { planHasEnded, startTimerFromNotification } from './notificationLaunch'
import type { Task } from '../types/task'

/** 開始の通知の「記録を始める」（#419） */
const confirm = vi.hoisted(() => ({ answer: true, asked: [] as string[] }))
vi.mock('./confirmDialog', () => ({
  askConfirm: vi.fn(async ({ message }: { message: string }) => {
    confirm.asked.push(message)
    return confirm.answer
  }),
}))

const DAY = '2026-10-14'
const plan = (id: string, over: Partial<Task> = {}): Task =>
  ({
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
    scheduledDate: DAY,
    startTime: '10:00',
    endTime: '11:00',
    priority: 'none',
    tags: [],
    recurrence: null,
    ...over,
  }) as Task

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 9, 58, 0))
  closeTaskDetail()
  confirm.answer = true
  confirm.asked = []
  useTaskStore.setState({ dataOwner: null, activeTimer: null })
  useTaskStore.getState().selectView('all')
})
afterEach(() => vi.useRealTimers())

describe('startTimerFromNotification', () => {
  it('今日の計画を開き、その予定のタイマーを元の予定の id 付きで始める', async () => {
    useTaskStore.setState({ tasks: [plan('ゼミ')] })
    await startTimerFromNotification('ゼミ', DAY)
    const s = useTaskStore.getState()
    expect(s.selectedView).toBe('planner')
    expect(s.activeTimer).toMatchObject({ taskTitle: 'ゼミ', taskId: 'ゼミ' })
  })

  it('予定の終わりを過ぎていたら始めず、詳細を開く', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 11, 5, 0))
    useTaskStore.setState({ tasks: [plan('ゼミ')] })
    await startTimerFromNotification('ゼミ', DAY)
    expect(useTaskStore.getState().activeTimer).toBeNull()
    expect(useOverlays.getState().detailTaskId).toBe('ゼミ')
  })

  it('済んだ予定は始めず、詳細を開く', async () => {
    useTaskStore.setState({ tasks: [plan('ゼミ', { completed: true })] })
    await startTimerFromNotification('ゼミ', DAY)
    expect(useTaskStore.getState().activeTimer).toBeNull()
    expect(useOverlays.getState().detailTaskId).toBe('ゼミ')
  })

  it('別のタイマーが動いていたら確かめてから切り替える。断ったらそのまま', async () => {
    const running = { taskTitle: '読書', startedAt: new Date(Date.now() - 1800_000).toISOString(), tags: [], taskId: null, color: null }
    useTaskStore.setState({ tasks: [plan('ゼミ')], activeTimer: running })
    confirm.answer = false
    await startTimerFromNotification('ゼミ', DAY)
    expect(confirm.asked).toHaveLength(1)
    expect(useTaskStore.getState().activeTimer).toEqual(running)

    confirm.answer = true
    await startTimerFromNotification('ゼミ', DAY)
    expect(useTaskStore.getState().activeTimer).toMatchObject({ taskTitle: 'ゼミ', taskId: 'ゼミ' })
  })

  it('同じ予定をもう計っていれば何もしない（聞かない）', async () => {
    const running = { taskTitle: 'ゼミ', startedAt: new Date().toISOString(), tags: [], taskId: 'ゼミ', color: null }
    useTaskStore.setState({ tasks: [plan('ゼミ')], activeTimer: running })
    await startTimerFromNotification('ゼミ', DAY)
    expect(confirm.asked).toHaveLength(0)
    expect(useTaskStore.getState().activeTimer).toEqual(running)
  })
})

describe('planHasEnded', () => {
  it('終わりの時刻を過ぎたら true。終わりの無い予定は false', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 10, 59, 0))
    expect(planHasEnded(plan('a'))).toBe(false)
    vi.setSystemTime(new Date(2026, 9, 14, 11, 0, 0))
    expect(planHasEnded(plan('a'))).toBe(true)
    expect(planHasEnded(plan('b', { endTime: null }))).toBe(false)
  })
})
