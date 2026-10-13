import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { requestQuickStart, takeQuickStart, QUICK_START_SYNC_WAIT_MS } from '../lib/quickStart'
import { TASK_DEFAULTS } from '../lib/taskDefaults'
import { fakeDb, inboxRow } from '../test/fakeSupabaseDb'
import type { Task } from '../types/task'
import { useSupabaseSync } from './useSupabaseSync'
import { useQuickStartLaunch } from './useQuickStartLaunch'

/** 起動 URL `?start=last`（#292）。同期は本物のストアと DB の偽物（`fakeSupabaseDb`）で回す */
const env = vi.hoisted(() => ({
  client: null as unknown,
  user: null as { id: string } | null,
  loading: false,
}))

vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  getSupabase: () => env.client,
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: env.user, loading: env.loading }),
}))
vi.mock('../lib/errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/errorReport')>()),
  reportSyncError: vi.fn(),
}))
vi.mock('./useAutoBackup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useAutoBackup')>()),
  backupNow: vi.fn(),
}))

function lastLog(): Task {
  return {
    ...TASK_DEFAULTS,
    id: 'log1',
    title: 'ES',
    description: '',
    completed: true,
    completedAt: null,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    order: 1,
    listId: 'inbox',
    sectionId: null,
    parentId: null,
    dueDate: '2026-10-02',
    startTime: '13:00',
    endTime: '14:00',
    priority: 'none',
    tags: ['就活'],
    category: '就活',
    kind: 'log',
    recurrence: null,
  }
}

const state = () => useTaskStore.getState()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T09:00:00.000Z'))
  env.client = null
  env.user = null
  env.loading = false
})

afterEach(() => {
  takeQuickStart()
  vi.useRealTimers()
})

describe('useQuickStartLaunch（?start=last）', () => {
  it('ログインしていなければ開いてすぐ前回の記録で始め、今日の計画を開いて知らせる', () => {
    useTaskStore.setState({ tasks: [...state().tasks, lastLog()], selectedView: 'all' })
    requestQuickStart('last')
    renderHook(() => useQuickStartLaunch())
    expect(state().activeTimer).toMatchObject({ taskTitle: 'ES', tags: ['就活'], taskId: null, color: null })
    expect(state().selectedView).toBe('planner')
    expect(state().moveBannerText).toEqual({ key: 'quickStart.started', params: { title: 'ES' } })
  })

  it('頼まれていなければ何もしない', () => {
    useTaskStore.setState({ tasks: [...state().tasks, lastLog()], selectedView: 'all' })
    renderHook(() => useQuickStartLaunch())
    expect(state().activeTimer).toBeNull()
    expect(state().selectedView).toBe('all')
  })

  it('前回の記録が無ければ何も始めず、記録パネルを開いて知らせる', () => {
    requestQuickStart('last')
    renderHook(() => useQuickStartLaunch())
    expect(state().activeTimer).toBeNull()
    expect(state().selectedView).toBe('planner')
    expect(state().moveBannerText).toEqual({ key: 'quickStart.noPrevious' })
  })

  it('計測中なら新しく始めず、そのタイマーを見せる', () => {
    const running = { taskTitle: '数学', startedAt: '2026-10-03T08:00:00.000Z', tags: [], taskId: null, color: null }
    useTaskStore.setState({ tasks: [...state().tasks, lastLog()], activeTimer: running })
    requestQuickStart('last')
    renderHook(() => useQuickStartLaunch())
    expect(state().activeTimer).toEqual(running)
    expect(state().tasks.filter((t) => t.kind === 'log')).toHaveLength(1)
    expect(state().moveBannerText).toEqual({ key: 'quickStart.alreadyRunning', params: { title: '数学' } })
  })

  it('StrictMode で 2 回描いても 1 回だけ', () => {
    useTaskStore.setState({ tasks: [...state().tasks, lastLog()] })
    requestQuickStart('last')
    const first = renderHook(() => useQuickStartLaunch())
    const startedAt = state().activeTimer?.startedAt
    first.unmount()
    vi.setSystemTime(new Date('2026-10-03T09:05:00.000Z'))
    renderHook(() => useQuickStartLaunch())
    expect(state().activeTimer?.startedAt).toBe(startedAt)
  })

  it('ログイン中は最初の同期を待つ。同期が終わらなければ待ちきれずに手元で始める', async () => {
    env.user = { id: 'u1' }
    useTaskStore.setState({ tasks: [...state().tasks, lastLog()] })
    requestQuickStart('last')
    renderHook(() => useQuickStartLaunch())
    expect(state().activeTimer).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUICK_START_SYNC_WAIT_MS)
    })
    expect(state().activeTimer).toMatchObject({ taskTitle: 'ES' })
  })

  it('ほかの端末で計測中なら、同期で取り込んだそのタイマーを見せ、二重に始めない', async () => {
    const db = fakeDb()
    db.tables.lists!.push({ ...inboxRow })
    db.tables.user_active_timer = [
      {
        user_id: 'u1',
        started_at: '2026-10-03T08:30:00+00:00',
        task_title: '数学',
        tags: [],
        task_id: null,
        color: null,
        updated_at: '2026-10-03T08:30:00.000000+00:00',
      },
    ]
    env.client = db.client
    env.user = { id: 'u1' }
    useTaskStore.setState({ tasks: [...state().tasks, lastLog()] })
    requestQuickStart('last')
    renderHook(() => {
      useSupabaseSync()
      useQuickStartLaunch()
    })
    for (let i = 0; i < 200 && state().lastSyncedAt === null; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
    }
    expect(state().lastSyncedAt).not.toBeNull()
    expect(state().activeTimer).toMatchObject({ taskTitle: '数学', startedAt: '2026-10-03T08:30:00.000Z' })
    expect(state().moveBannerText).toEqual({ key: 'quickStart.alreadyRunning', params: { title: '数学' } })
    expect(db.tables.user_active_timer[0]).toMatchObject({ task_title: '数学' })
  })
})
