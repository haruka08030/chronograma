import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 完了の付け外しを Canvas に書けなかったら覚えておいて送り直し、届くまで同期で上書きしない（#493） */
const mocks = vi.hoisted(() => ({ items: vi.fn(), complete: vi.fn() }))
vi.mock('../lib/canvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/canvas')>()),
  fetchCanvasItems: mocks.items,
  markCanvasComplete: mocks.complete,
}))
vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  isSupabaseConfigured: true,
}))
vi.mock('../contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts/AuthContext')>()),
  useAuth: () => ({ user: { id: 'u1' }, session: { access_token: 'tok' }, loading: false }),
}))
vi.mock('../lib/tabLeader', () => ({ isLeaderTab: async () => true }))
vi.mock('../lib/notify', () => ({ notify: () => {} }))
vi.mock('../lib/errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/errorReport')>()),
  reportFailure: () => {},
}))

const { useCanvasSync, requestCanvasSync } = await import('./useCanvasSync')
const { useTaskStore } = await import('../store/taskStore')
const { canvasTaskId, CanvasRequestError } = await import('../lib/canvas')
const { flushIntegrationWrites } = await import('../lib/integrationWrites')

const CONN = 'school.instructure.com'
const TASK_ID = canvasTaskId(CONN, 'assignment', '42')
const item = (done: boolean) => ({
  type: 'assignment',
  id: '42',
  title: 'レポート',
  courseId: '1',
  courseName: 'CSE-101',
  url: `https://${CONN}/a/42`,
  dueAt: '2026-10-25T14:59:00Z',
  done,
})
const payload = (done: boolean) => ({
  connections: [{ id: CONN, windowStart: '2026-09-19', windowEnd: '2027-02-16', items: [item(done)] }],
})
const task = () => useTaskStore.getState().tasks.find((t) => t.id === TASK_ID)
const setCompleted = (completed: boolean) =>
  act(async () => {
    useTaskStore.setState({ tasks: useTaskStore.getState().tasks.map((t) => (t.id === TASK_ID ? { ...t, completed } : t)) })
  })
const queued = () => Object.keys(JSON.parse(localStorage.getItem('chronograma-writeback-v1:canvas:u1') ?? '{}'))
const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {})
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  mocks.items.mockReset()
  mocks.complete.mockReset()
  useTaskStore.setState({ tasks: [], lastSyncedAt: '2026-10-19T00:00:00Z' })
})
afterEach(() => vi.useRealTimers())

describe('useCanvasSync', () => {
  it('未完了に戻すのに失敗しても、次の同期で完了に戻さず、送り直す', async () => {
    mocks.items.mockResolvedValue(payload(false))
    const { unmount } = renderHook(() => useCanvasSync())
    await flush()
    expect(task()?.completed).toBe(false)

    // 完了にして Canvas にも書けた
    mocks.complete.mockResolvedValueOnce({ ok: true })
    await setCompleted(true)
    await act(async () => vi.advanceTimersByTime(5_000))
    await flush()
    expect(queued()).toEqual([])

    // 未完了に戻したが、書けなかった
    mocks.complete.mockRejectedValueOnce(new CanvasRequestError('canvas_api', 'canvas_api'))
    await setCompleted(false)
    await act(async () => vi.advanceTimersByTime(5_000))
    await flush()
    expect(queued()).toEqual([TASK_ID])

    // Canvas はまだ完了のまま。同期しても手元の未完了は戻さず、ついでに送り直す
    mocks.items.mockResolvedValue(payload(true))
    mocks.complete.mockResolvedValueOnce({ ok: true })
    act(() => requestCanvasSync())
    await flush()
    expect(task()?.completed).toBe(false)
    expect(mocks.complete).toHaveBeenLastCalledWith(CONN, 'assignment', '42', false)
    expect(queued()).toEqual([])
    unmount()
  })

  it('ログアウトの前には猶予を待たずに送り、送れなければ残った数を返す', async () => {
    mocks.items.mockResolvedValue(payload(false))
    const { unmount } = renderHook(() => useCanvasSync())
    await flush()

    // 完了にした直後（猶予の間）にログアウトする: 待たずに送る
    mocks.complete.mockResolvedValueOnce({ ok: true })
    await setCompleted(true)
    let left: Awaited<ReturnType<typeof flushIntegrationWrites>> = {}
    await act(async () => {
      left = await flushIntegrationWrites()
    })
    expect(mocks.complete).toHaveBeenLastCalledWith(CONN, 'assignment', '42', true)
    expect(left).toEqual({})
    expect(queued()).toEqual([])

    // 送れなければ待ちに残り、数を返す
    mocks.complete.mockRejectedValueOnce(new CanvasRequestError('canvas_api', 'canvas_api'))
    await setCompleted(false)
    await act(async () => {
      left = await flushIntegrationWrites()
    })
    expect(left).toEqual({ canvas: 1 })
    expect(queued()).toEqual([TASK_ID])
    unmount()
    // 外したあとは数えない
    expect(await flushIntegrationWrites()).toEqual({})
  })
})
