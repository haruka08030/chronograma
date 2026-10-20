import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 完了で Notion を進めるのに失敗したら、覚えておいて送り直す。設定がずれたら黙って完了にしない（#493） */
const mocks = vi.hoisted(() => ({ pages: vi.fn(), advance: vi.fn(), notify: vi.fn() }))
vi.mock('../lib/notion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/notion')>()),
  fetchNotionPages: mocks.pages,
  advanceNotionPage: mocks.advance,
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
vi.mock('../lib/notify', () => ({ notify: mocks.notify }))
vi.mock('../lib/errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/errorReport')>()),
  reportFailure: () => {},
}))

const { useNotionSync, requestNotionSync, useNotionSyncState, NOTION_CONFIG_CHANGED } = await import('./useNotionSync')
const { useTaskStore } = await import('../store/taskStore')
const { notionTaskId, NotionRequestError } = await import('../lib/notion')

const PAGE = '0123456789abcdef0123456789abcdef'
const TASK_ID = notionTaskId(PAGE, 'ES を出す')
const page = { pageId: PAGE, url: 'https://www.notion.so/x', title: 'A社', status: 'ES を出す', date: null }
const payload = (patch: Record<string, unknown> = {}) => ({
  connected: true,
  configured: true,
  databaseTitle: '就活',
  datesEnabled: false,
  pages: [page],
  ...patch,
})
const task = () => useTaskStore.getState().tasks.find((t) => t.id === TASK_ID)
const queued = () => Object.keys(JSON.parse(localStorage.getItem('chronograma-writeback-v1:notion:u1') ?? '{}'))
const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {})
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  mocks.pages.mockReset()
  mocks.advance.mockReset()
  mocks.notify.mockReset()
  useTaskStore.setState({ tasks: [], lastSyncedAt: '2026-10-19T00:00:00Z' })
})
afterEach(() => vi.useRealTimers())

describe('useNotionSync', () => {
  it('進めるのに失敗したら覚えておき、次の取り込みで送り直す', async () => {
    mocks.pages.mockResolvedValue(payload())
    const { unmount } = renderHook(() => useNotionSync())
    await flush()
    expect(task()?.completed).toBe(false)

    mocks.advance.mockRejectedValueOnce(new NotionRequestError(null, 'Failed to fetch'))
    await act(async () => {
      useTaskStore.setState({ tasks: useTaskStore.getState().tasks.map((t) => ({ ...t, completed: true })) })
    })
    await act(async () => vi.advanceTimersByTime(5_000))
    await flush()
    expect(mocks.advance).toHaveBeenCalledTimes(1)
    expect(queued()).toEqual([TASK_ID])

    // まだ Notion ではそのステータスのまま。取り込みのついでに送り直す
    mocks.advance.mockResolvedValueOnce({ advanced: true, to: '面接' })
    act(() => requestNotionSync())
    await flush()
    expect(mocks.advance).toHaveBeenCalledTimes(2)
    expect(mocks.advance).toHaveBeenLastCalledWith(PAGE, 'ES を出す')
    expect(queued()).toEqual([])
    unmount()
  })

  it('Notion 側でもう進んでいれば、送り直さずに外す', async () => {
    mocks.pages.mockResolvedValue(payload())
    const { unmount } = renderHook(() => useNotionSync())
    await flush()
    mocks.advance.mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      useTaskStore.setState({ tasks: useTaskStore.getState().tasks.map((t) => ({ ...t, completed: true })) })
    })
    await act(async () => vi.advanceTimersByTime(5_000))
    await flush()
    expect(queued()).toEqual([TASK_ID])

    mocks.pages.mockResolvedValue(payload({ pages: [] }))
    act(() => requestNotionSync())
    await flush()
    expect(mocks.advance).toHaveBeenCalledTimes(1)
    expect(queued()).toEqual([])
    unmount()
  })

  it('設定がずれた（ステータスの名前を変えた）ら、無くなった行を完了にせず、見直しを知らせる', async () => {
    mocks.pages.mockResolvedValue(payload())
    const { result, unmount } = renderHook(() => {
      useNotionSync()
      return useNotionSyncState()
    })
    await flush()
    expect(task()?.completed).toBe(false)

    mocks.pages.mockResolvedValue(payload({ configChanged: true, pages: [] }))
    act(() => requestNotionSync())
    await flush()
    expect(task()?.completed).toBe(false)
    expect(result.current.error).toBe(NOTION_CONFIG_CHANGED)
    expect(mocks.notify).toHaveBeenCalledTimes(1)

    // 何度取り込んでも知らせは 1 回
    act(() => requestNotionSync())
    await flush()
    expect(mocks.notify).toHaveBeenCalledTimes(1)
    unmount()
  })
})
