import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fakeDb, inboxRow, taskRow } from '../test/fakeSupabaseDb'
import { useSupabaseSync } from './useSupabaseSync'

/**
 * 他の端末の変更の通知で同期を起こす（#410）。本物のストアと、Realtime も真似る PostgREST・DB の偽物で、
 * 通知が来たらすぐ取り込むこと・自分の送った行のこだまでは回さないこと・購読できている間の取得の間隔を確かめる
 */
const env = vi.hoisted(() => ({
  client: null as unknown,
  user: null as { id: string } | null,
}))
vi.mock('../lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/supabase')>()),
  getSupabase: () => env.client,
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: env.user, loading: false }),
}))
vi.mock('../lib/errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/errorReport')>()),
  reportSyncError: vi.fn(),
}))
vi.mock('./useAutoBackup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useAutoBackup')>()),
  backupNow: vi.fn(async () => true),
}))
vi.mock('../lib/webPush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/webPush')>()),
  detachWebPush: vi.fn(async () => {}),
  resyncWebPush: vi.fn(async () => {}),
}))

let db: ReturnType<typeof fakeDb>
let requests: string[] = []
const pulls = () => requests.filter((r) => r === 'rpc:sync_changes_since').length

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T09:00:00.000Z'))
  db = fakeDb({ realtime: true })
  db.tables.lists!.push({ ...inboxRow })
  db.tables.tasks!.push(taskRow('a', { title: 'a' }), taskRow('b', { title: 'b' }))
  const rpc = db.client.rpc.bind(db.client)
  requests = []
  vi.spyOn(db.client, 'rpc').mockImplementation(((name: string, args?: Record<string, unknown>) => {
    requests.push(`rpc:${name}`)
    return rpc(name, args)
  }) as typeof db.client.rpc)
  env.client = db.client
  env.user = null
  setVisibility('visible')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  setVisibility('visible')
})

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function untilSynced(before = useTaskStore.getState().lastSyncedAt) {
  for (let i = 0; i < 200; i++) {
    await tick(1)
    const s = useTaskStore.getState()
    if (s.lastSyncedAt !== before && s.syncState === 'idle') return
  }
  throw new Error(`sync did not finish (state: ${useTaskStore.getState().syncState})`)
}

async function signIn() {
  env.user = { id: 'u1' }
  db.auth.user = 'u1'
  const hook = renderHook(() => useSupabaseSync())
  await untilSynced()
  // 購読の返事と、最初の同期の後の通知（自分の送った行）を流してから数える
  await tick(5_000)
  requests = []
  return hook
}

const title = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)?.title
const serverRow = (id: string) => db.tables.tasks!.find((r) => r.id === id)

describe('他の端末の変更の通知（#410）', () => {
  it('ほかの端末が直した行は、1 分を待たずに数秒で届く', async () => {
    await signIn()
    expect(db.realtime.subscribed()).toBe(1)
    db.advance(60_000)
    db.oldClientWrite('tasks', { ...serverRow('a')!, title: 'a from phone', updated_at: '2026-10-03T00:30:00.000000+00:00' })
    await tick(2_000)
    expect(title('a')).toBe('a from phone')
    expect(pulls()).toBe(1)
  })

  it('ほかの端末で消した行も届く（消えた印の通知）', async () => {
    await signIn()
    db.advance(60_000)
    await db.client.from('tasks').delete().eq('user_id', 'u1').in('id', ['b'])
    await tick(2_000)
    expect(title('b')).toBeUndefined()
  })

  it('ほかの端末で始めたタイマー・変えたラベルも届く', async () => {
    await signIn()
    db.advance(60_000)
    db.oldClientWrite('user_active_timer', {
      user_id: 'u1',
      started_at: '2026-10-03T00:30:00.000Z',
      task_title: '英語',
      tags: [],
      task_id: null,
      color: null,
      ends_at: null,
      updated_at: '2026-10-03T00:30:00.000000+00:00',
    })
    await tick(2_000)
    expect(useTaskStore.getState().activeTimer?.taskTitle).toBe('英語')
  })

  it('自分の編集は送った後にもう 1 回同期しない（自分の送った行の通知では回さない）', async () => {
    await signIn()
    act(() => useTaskStore.getState().updateTask('a', { title: 'a edited' }))
    await tick(10_000)
    expect(serverRow('a')!.title).toBe('a edited')
    expect(db.realtime.sent).toBeGreaterThan(0)
    expect(pulls()).toBe(1)
  })

  it('購読できている間は、変化が無ければ取得は 5 分に 1 回', async () => {
    await signIn()
    for (let i = 0; i < 10; i++) await tick(60_000)
    expect(pulls()).toBeGreaterThanOrEqual(1)
    expect(pulls()).toBeLessThanOrEqual(2)
  })

  it('購読できなければ、今までどおり 1 分ごとに取る', async () => {
    db.realtime.up = false
    await signIn()
    for (let i = 0; i < 5; i++) await tick(60_000)
    expect(pulls()).toBeGreaterThanOrEqual(4)
  })

  it('タブが隠れたら購読を外し、戻ったらまた購読する', async () => {
    await signIn()
    expect(db.realtime.subscribed()).toBe(1)
    setVisibility('hidden')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(db.realtime.subscribed()).toBe(0)
    setVisibility('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(db.realtime.subscribed()).toBe(1)
  })

  it('購読が切れてつながり直したら、待たずに 1 回取る（切れていた間の変更を取りこぼさない）', async () => {
    await signIn()
    act(() => db.realtime.drop())
    db.advance(60_000)
    // 切れている間の変更の通知は届かない
    db.oldClientWrite('tasks', { ...serverRow('a')!, title: 'a while offline', updated_at: '2026-10-03T00:30:00.000000+00:00' })
    await tick(2_000)
    expect(title('a')).toBe('a')
    act(() => db.realtime.reconnect())
    await tick(2_000)
    expect(title('a')).toBe('a while offline')
    expect(pulls()).toBe(1)
  })

  it('購読できなかった回数は 1 日 1 回にまとめて記録に送る', async () => {
    const { reportSyncError } = await import('../lib/errorReport')
    await signIn()
    vi.mocked(reportSyncError).mockClear()
    act(() => db.realtime.drop())
    act(() => db.realtime.reconnect())
    act(() => db.realtime.drop())
    await tick(2_000)
    const calls = vi.mocked(reportSyncError).mock.calls.filter(([stage]) => stage === 'realtime')
    expect(calls.length).toBeLessThanOrEqual(1)
  })

  it('ログアウト（フックが外れる）で購読をやめる', async () => {
    const hook = await signIn()
    hook.unmount()
    expect(db.realtime.subscribed()).toBe(0)
  })
})
