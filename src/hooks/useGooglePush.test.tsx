import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import { TASK_DEFAULTS } from '../lib/taskDefaults'

/** アプリの予定を Google に送る（#487）: カレンダーを開く前の変更・切れている間の変更を捨てない */
const mocks = vi.hoisted(() => ({
  upsert: vi.fn(async () => null),
  remove: vi.fn(async () => {}),
  status: vi.fn(async () => ({ connected: true, canWrite: true as boolean | null })),
  leave: vi.fn(),
}))
vi.mock('../lib/googleCalendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/googleCalendar')>()),
  upsertGoogleEvent: mocks.upsert,
  deleteGoogleEvent: mocks.remove,
  googleCalendarStatus: mocks.status,
}))
vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  isSupabaseConfigured: true,
  sendFunctionOnLeave: mocks.leave,
}))
vi.mock('../contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts/AuthContext')>()),
  useAuth: () => ({ user: { id: 'u1' }, session: { access_token: 'token' }, loading: false }),
}))
vi.mock('../lib/errorReport', () => ({ reportFailure: vi.fn() }))

const { useGooglePush, retryGooglePush } = await import('./useGooglePush')
const { useTaskStore } = await import('../store/taskStore')
const { GoogleCalendarError } = await import('../lib/googleCalendar')
const { loadPushQueue, MAX_PUSH_TRIES, LEAVE_SEND_MAX } = await import('../lib/googlePushQueue')
const { googleEventIdForTask } = await import('../lib/googlePush')

const event = (id: string, over: Partial<Task> = {}): Task =>
  ({
    ...TASK_DEFAULTS,
    id,
    kind: 'event',
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
    scheduledDate: '2026-10-14',
    startTime: '10:00',
    endTime: '11:30',
    endDate: null,
    timeZone: null,
    timeZoneAnchor: null,
    color: null,
    archivedAt: null,
    deletedAt: null,
    ...over,
  }) as Task

const queued = () => Object.keys(loadPushQueue('u1')).sort()
const addEvents = (...tasks: Task[]) => act(() => useTaskStore.setState((s) => ({ tasks: [...s.tasks, ...tasks] })))
/** まとめて送るまでの待ちを進める */
const settle = () => act(async () => vi.advanceTimersByTimeAsync(2_000))

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  mocks.upsert.mockReset().mockResolvedValue(null)
  mocks.remove.mockReset().mockResolvedValue(undefined)
  mocks.status.mockReset().mockResolvedValue({ connected: true, canWrite: true })
  mocks.leave.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useTaskStore.setState({ tasks: [], googleConnected: true, googleCanWrite: false, googleReconnectNeeded: false, googlePushFailed: 0 })
})
afterEach(() => vi.useRealTimers())

describe('useGooglePush', () => {
  it('カレンダーを開く前（書き込めるか分からない）でも待ちに入れ、関数に聞いて送る', async () => {
    renderHook(() => useGooglePush())
    await addEvents(event('a'))
    expect(queued()).toEqual(['a'])
    await settle()
    expect(mocks.status).toHaveBeenCalledTimes(1)
    expect(useTaskStore.getState().googleCanWrite).toBe(true)
    await settle()
    expect(mocks.upsert).toHaveBeenCalledWith(googleEventIdForTask('a'), expect.anything())
    expect(queued()).toEqual([])
  })

  it('書き込めないと分かっている接続では、待ちに入れない', async () => {
    localStorage.setItem('chronograma.googleCanWrite', 'u1:0')
    renderHook(() => useGooglePush())
    await addEvents(event('a'))
    expect(queued()).toEqual([])
  })

  it('切れたら待ちを残して「もう一度つなぐ」を出し、つなぎ直したら送る', async () => {
    useTaskStore.setState({ googleCanWrite: true })
    mocks.upsert.mockRejectedValueOnce(new GoogleCalendarError('expired', 'google_auth_expired'))
    renderHook(() => useGooglePush())
    await addEvents(event('a'))
    await settle()
    expect(queued()).toEqual(['a'])
    expect(useTaskStore.getState().googleReconnectNeeded).toBe(true)
    expect(useTaskStore.getState().googleConnected).toBe(false)
    // 切れている間の変更も覚える
    await addEvents(event('b'))
    expect(queued()).toEqual(['a', 'b'])
    act(() => useTaskStore.getState().setGoogleConnected(true))
    await settle()
    expect(mocks.upsert).toHaveBeenCalledTimes(3)
    expect(queued()).toEqual([])
  })

  it('何度送っても送れない予定は数を出し、「もう一度送る」で送り直す', async () => {
    useTaskStore.setState({ googleCanWrite: true })
    mocks.upsert.mockRejectedValue(new GoogleCalendarError('failed', 'google_failed'))
    renderHook(() => useGooglePush())
    await addEvents(event('a'))
    for (let i = 0; i < MAX_PUSH_TRIES; i++) await act(async () => vi.advanceTimersByTimeAsync(5 * 60_000))
    expect(useTaskStore.getState().googlePushFailed).toBe(1)
    expect(mocks.upsert).toHaveBeenCalledTimes(MAX_PUSH_TRIES)

    mocks.upsert.mockReset().mockResolvedValue(null)
    await act(async () => {
      retryGooglePush()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mocks.upsert).toHaveBeenCalledTimes(1)
    expect(useTaskStore.getState().googlePushFailed).toBe(0)
    expect(queued()).toEqual([])
  })

  it('タブを閉じるときに送る数は抑える', async () => {
    useTaskStore.setState({ googleCanWrite: true })
    renderHook(() => useGooglePush())
    await addEvents(...Array.from({ length: LEAVE_SEND_MAX + 10 }, (_, i) => event(`e${i}`)))
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(mocks.leave).toHaveBeenCalledTimes(LEAVE_SEND_MAX)
  })
})
