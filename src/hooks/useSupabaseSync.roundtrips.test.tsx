import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { fakeDb, inboxRow, taskRow } from '../test/fakeSupabaseDb'
import { PULL_STATE_KEY_PREFIX, readStored } from '../lib/dataStore'
import { clearLocalAccountState } from '../lib/accountBoundary'
import { TOMBSTONE_RETENTION_MS } from '../lib/syncPull'
import { useSupabaseSync } from './useSupabaseSync'
import { cloudReady } from '../lib/cloudReady'

/**
 * 同期の往復の数（#258）。本物のストアと PostgREST・DB の偽物（`035` の sync_changes_since も真似る）で、
 * 何も変わっていない同期の問い合わせの数・開き直したときの取り方・タブが 2 つのときの 1 分ごとの取得を数える
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
  backupNow: vi.fn(),
}))
// 通知の購読（Service Worker）は jsdom に無い
vi.mock('../lib/webPush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/webPush')>()),
  detachWebPush: vi.fn(async () => {}),
  resyncWebPush: vi.fn(async () => {}),
}))

let db: ReturnType<typeof fakeDb>
/** 問い合わせ（表の読み書き・関数）の数 */
let requests: string[] = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T09:00:00.000Z'))
  db = fakeDb()
  db.tables.lists!.push({ ...inboxRow })
  db.tables.tasks!.push(taskRow('a', { title: 'a' }), taskRow('b', { title: 'b' }))
  const from = db.client.from.bind(db.client)
  const rpc = db.client.rpc.bind(db.client)
  requests = []
  vi.spyOn(db.client, 'from').mockImplementation((table: string) => {
    requests.push(table)
    return from(table)
  })
  vi.spyOn(db.client, 'rpc').mockImplementation(((name: string, args?: Record<string, unknown>) => {
    requests.push(`rpc:${name}`)
    return rpc(name, args)
  }) as typeof db.client.rpc)
  env.client = db.client
  env.user = null
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function untilSynced(before = useTaskStore.getState().lastSyncedAt) {
  for (let i = 0; i < 200; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    const s = useTaskStore.getState()
    if (s.lastSyncedAt !== before && s.syncState === 'idle') return
  }
  throw new Error(`sync did not finish (state: ${useTaskStore.getState().syncState})`)
}

function signIn(userId = 'u1') {
  env.user = { id: userId }
  db.auth.user = userId
  return renderHook(() => useSupabaseSync())
}

/** 回線が戻った合図で 1 回同期し、その間の問い合わせを返す */
async function syncNow(): Promise<string[]> {
  const before = useTaskStore.getState().lastSyncedAt
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
  requests = []
  await act(async () => {
    window.dispatchEvent(new Event('online'))
  })
  await untilSynced(before)
  return requests
}

const title = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)?.title
const serverRow = (id: string) => db.tables.tasks!.find((r) => r.id === id)

describe('同期の往復（#258）', () => {
  it('クラウドの内容を取り込んだら、送信・設定の同期を待たずに Notion・Canvas に合図する（#444）', async () => {
    useTaskStore.setState({ cloudPulledAt: null, lastSyncedAt: null })
    let syncedWhenPulled: string | null | undefined
    const unsub = useTaskStore.subscribe((s, prev) => {
      if (s.cloudPulledAt && !prev.cloudPulledAt) syncedWhenPulled = s.lastSyncedAt
    })
    signIn()
    await untilSynced(null)
    unsub()
    // 合図の時点では、まだ同期は終わっていない
    expect(syncedWhenPulled).toBeNull()
    expect(cloudReady(useTaskStore.getState())).toBe(true)
  })

  it('何も変わっていない同期は 1 往復（前は 1 つずつ 9 往復以上）', async () => {
    signIn()
    await untilSynced()
    await syncNow()
    expect(await syncNow()).toEqual(['rpc:sync_changes_since'])

    // 関数の無い DB（`035` を流す前）では前の取り方: 版の下限・時刻・4 表・印・上限で消した印・設定 6 つ・1 日の気分
    db.missing.add('sync_changes_since')
    const separately = await syncNow()
    expect(separately.length).toBeGreaterThanOrEqual(9)
    expect(separately).toContain('user_settings')
  })

  it('設定・1 日の気分も同じ 1 往復で分かり、変わったものだけ取りに行く', async () => {
    signIn()
    await untilSynced()
    await syncNow()
    // ほかの端末がラベル表と気分を変えた
    db.tables.user_settings = [
      { user_id: 'u1', log_labels: [{ name: 'ゼミ', color: 'sage' }], updated_at: '2026-10-03T00:30:00.000000+00:00' },
    ]
    db.tables.day_moods = [{ user_id: 'u1', day: '2026-10-03', mood: 4, note: '', updated_at: '2026-10-03T00:30:00.000000+00:00' }]
    db.advance(60 * 60_000)
    const reqs = await syncNow()
    expect(reqs.filter((r) => r === 'user_settings')).toEqual(['user_settings'])
    // 気分は 1 往復の答えに入っている
    expect(reqs).not.toContain('day_moods')
    expect(useTaskStore.getState().timeLogTagPresets).toContain('ゼミ')
    expect(useTaskStore.getState().dayMoods['2026-10-03']?.mood).toBe(4)
    // もう変わっていなければ 1 往復だけ
    expect(await syncNow()).toEqual(['rpc:sync_changes_since'])
  })

  it('開き直しても前回の目印から差分で取る。閉じている間のほかの端末の変更・削除も届く', async () => {
    const first = signIn()
    await untilSynced()
    expect(db.fullFetches()).toBe(1)
    expect(readStored(`${PULL_STATE_KEY_PREFIX}u1`)).not.toBeNull()
    first.unmount()

    // 閉じている間にほかの端末が a を直し、b を消し、c を足す
    db.advance(60 * 60_000)
    db.oldClientWrite('tasks', { ...serverRow('a')!, title: 'a from pc', updated_at: '2026-10-03T01:00:00.000000+00:00' })
    await db.client.from('tasks').delete().eq('user_id', 'u1').in('id', ['b'])
    db.oldClientWrite('tasks', taskRow('c', { title: 'c', updated_at: '2026-10-03T01:00:00.000000+00:00' }))

    signIn()
    await untilSynced()
    expect(db.fullFetches()).toBe(1)
    expect(title('a')).toBe('a from pc')
    expect(title('b')).toBeUndefined()
    expect(title('c')).toBe('c')
    // 手元の編集も送れる
    act(() => useTaskStore.getState().updateTask('c', { title: 'c edited' }))
    await syncNow()
    expect(serverRow('c')!.title).toBe('c edited')
  })

  it('30 日より長く閉じていたら、消えた印が消えているかもしれないので全部を取る', async () => {
    const first = signIn()
    await untilSynced()
    first.unmount()
    db.advance(TOMBSTONE_RETENTION_MS)
    signIn()
    await untilSynced()
    expect(db.fullFetches()).toBe(2)
  })

  it('ログアウトで前回取得した内容を消す。別の人には使わない', async () => {
    const first = signIn()
    await untilSynced()
    first.unmount()
    clearLocalAccountState('u1')
    expect(readStored(`${PULL_STATE_KEY_PREFIX}u1`)).toBeNull()
    signIn()
    await untilSynced()
    expect(db.fullFetches()).toBe(2)
  })

  it('画面に戻ったときの visibilitychange と focus で 2 回は回さない', async () => {
    signIn()
    await untilSynced()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    requests = []
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(requests.filter((r) => r === 'rpc:sync_changes_since')).toHaveLength(1)
  })

  it('タブが 2 つでも 1 分ごとの取得は 1 本', async () => {
    signIn()
    await untilSynced()
    // 2 つ目のタブ（同じ人・同じ保存の置き場所）
    renderHook(() => useSupabaseSync())
    await untilSynced()
    requests = []
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })
    }
    const pulls = requests.filter((r) => r === 'rpc:sync_changes_since').length
    expect(pulls).toBeGreaterThanOrEqual(4)
    expect(pulls).toBeLessThanOrEqual(5)
  })

  it('オフラインの間の編集は、回線が戻ると送り、その間のほかの端末の変更も取り込む', async () => {
    signIn()
    await untilSynced()
    // 回線が無い（取得が失敗する）
    db.missing.add('sync_changes_since')
    db.missing.add('sync_server_now')
    act(() => useTaskStore.getState().updateTask('a', { title: 'a offline' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    for (let i = 0; i < 200 && useTaskStore.getState().syncState !== 'error'; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
    }
    expect(useTaskStore.getState().syncState).toBe('error')
    db.advance(60_000)
    db.oldClientWrite('tasks', { ...serverRow('b')!, priority: 'high', updated_at: '2026-10-03T00:30:00.000000+00:00' })

    db.missing.clear()
    await syncNow()
    expect(serverRow('a')!.title).toBe('a offline')
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'b')?.priority).toBe('high')
  })
})
