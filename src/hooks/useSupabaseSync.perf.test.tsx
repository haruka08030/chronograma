import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../store/taskStore'
import { BASELINE_KEY_PREFIX } from '../lib/dataStore'
import { clearBaseline, loadBaseline } from '../lib/syncMerge'
import { fakeDb, inboxRow, taskRow } from '../test/fakeSupabaseDb'
import { useSupabaseSync } from './useSupabaseSync'

/**
 * 同期 1 回の重さ（#257）。本物のストアと PostgREST・DB の偽物で、1 万行を同期した後の 1 分ごとの同期と編集 1 回を測る。
 * 変わっていない行は文字列・ハッシュにして比べ直さず、控えも書き直さない。
 * 前は変わっていない同期 1 回で JSON.stringify が約 96 万回、3 秒ほどかかっていた（同じ偽物・同じ 1 万行）。
 * 編集 1 回の時間は保存（zustand の persist で全データを文字列にする、#266）が大半なので、測って出すだけ
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

let db: ReturnType<typeof fakeDb>
let storage: ReturnType<typeof unlimitedStorage>

/** 容量の上限の無い localStorage（jsdom は 5 MB で、1 万行の本体と控えが入らない）。書いたキーを数える */
function unlimitedStorage() {
  const m = new Map<string, string>()
  const writes: string[] = []
  const s = {
    get length() {
      return m.size
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes.push(k)
      m.set(k, String(v))
    },
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  }
  return Object.assign(s as Storage, { writes })
}

beforeEach(() => {
  storage = unlimitedStorage()
  vi.stubGlobal('localStorage', storage)
  // 時間を測るので performance は本物のまま
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-10-03T09:00:00.000Z'))
  useTaskStore.getState().resetLocalData()
  db = fakeDb({ maxRows: 100_000 })
  db.tables.lists!.push({ ...inboxRow })
  env.client = db.client
  env.user = null
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function seed(n: number) {
  for (let i = 0; i < n; i++) db.tables.tasks!.push(taskRow(`t${i}`, { title: `task ${i}`, sort_order: i, tags: i % 3 === 0 ? ['x'] : [] }))
}

async function untilSynced(before = useTaskStore.getState().lastSyncedAt) {
  for (let i = 0; i < 400; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    const s = useTaskStore.getState()
    if (s.lastSyncedAt !== before && s.syncState === 'idle') return
  }
  throw new Error(`sync did not finish (state: ${useTaskStore.getState().syncState})`)
}

/** 回線が戻った合図で 1 回同期し、かかった時間（ms）を返す */
async function syncNow(): Promise<number> {
  const before = useTaskStore.getState().lastSyncedAt
  vi.advanceTimersByTime(1000)
  const t0 = performance.now()
  await act(async () => {
    window.dispatchEvent(new Event('online'))
  })
  await untilSynced(before)
  return performance.now() - t0
}

async function signIn() {
  env.user = { id: 'u1' }
  renderHook(() => useSupabaseSync())
  await untilSynced()
}

const baselineWrites = () => storage.writes.filter((k) => k.startsWith(BASELINE_KEY_PREFIX)).length
const title = (id: string) => useTaskStore.getState().tasks.find((t) => t.id === id)?.title
const serverRow = (id: string) => db.tables.tasks!.find((r) => r.id === id)

describe('1 万行の同期の重さ（#257）', () => {
  it('変わっていない同期は行を文字列にせず、控えを書かない（時間の目標は 50 ms）', async () => {
    seed(10_000)
    await signIn()
    expect(useTaskStore.getState().tasks).toHaveLength(10_000)
    // 1 回目は取り込んだ行を手元の書き方にそろえて控えを作り直すので、2 回目から測る
    await syncNow()

    const stringify = vi.spyOn(JSON, 'stringify')
    const times: number[] = []
    for (let i = 0; i < 3; i++) {
      stringify.mockClear()
      storage.writes.length = 0
      times.push(await syncNow())
      // 行ごとに比べると 1 万回を超える（前は約 96 万回）
      expect(stringify.mock.calls.length).toBeLessThan(50)
      expect(baselineWrites()).toBe(0)
    }
    console.info(`[perf] unchanged sync of 10k rows: ${times.map((t) => t.toFixed(1)).join(' / ')} ms`)
    // 目標は 50 ms（このテストだけを回すと 20 ms ほど）。ほかのテストと並べて回すと遅くなるので、落とすのは桁が違うときだけ
    expect(Math.min(...times)).toBeLessThan(250)
  }, 120_000)

  it('1 行の編集: 送るのはその行だけで、控えは 1 回書く', async () => {
    seed(10_000)
    await signIn()
    await syncNow()
    const upserts: number[] = []
    const realFrom = db.client.from.bind(db.client)
    vi.spyOn(db.client, 'from').mockImplementation((table: string) => {
      const q = realFrom(table)
      if (table !== 'tasks') return q
      const upsert = q.upsert.bind(q)
      return Object.assign(q, {
        upsert: (rows: unknown[], o?: unknown) => {
          upserts.push(rows.length)
          return upsert(rows as never, o as never)
        },
      })
    })
    storage.writes.length = 0
    const t0 = performance.now()
    act(() => useTaskStore.getState().updateTask('t5', { title: 'edited' }))
    const editMs = performance.now() - t0
    const before = useTaskStore.getState().lastSyncedAt
    const t1 = performance.now()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    await untilSynced(before)
    const syncMs = performance.now() - t1
    console.info(`[perf] edit ${editMs.toFixed(1)} ms, sync after the edit ${syncMs.toFixed(1)} ms (10k rows)`)
    expect(serverRow('t5')!.title).toBe('edited')
    expect(upserts).toEqual([1])
    expect(baselineWrites()).toBe(1)
  }, 120_000)
})

describe('覚えた比べ方・控えでも取りこぼさない（#257）', () => {
  it('ほかの端末の変更・消した行は、変わっていない同期が続いた後でも届く', async () => {
    seed(3)
    await signIn()
    await syncNow()
    await syncNow()
    // ほかの端末が t1 の題名を変え、t2 を消す
    db.advance(60_000)
    db.oldClientWrite('tasks', { ...serverRow('t1')!, title: 'from pc', updated_at: '2026-10-03T00:10:00.000000+00:00' })
    await db.client.from('tasks').delete().eq('user_id', 'u1').in('id', ['t2'])
    await syncNow()
    expect(title('t1')).toBe('from pc')
    expect(title('t2')).toBeUndefined()
    expect(Object.keys(loadBaseline('u1')!.tasks).sort()).toEqual(['t0', 't1'])
    // 手元の編集も届く
    act(() => useTaskStore.getState().updateTask('t0', { title: 'from phone' }))
    await syncNow()
    expect(serverRow('t0')!.title).toBe('from phone')
    expect(serverRow('t1')!.title).toBe('from pc')
  })

  it('ほかのタブが控えを消した・書き換えたら、手元の内容が同じでも控えを書き直す', async () => {
    seed(3)
    await signIn()
    await syncNow()
    storage.writes.length = 0
    clearBaseline('u1')
    await syncNow()
    expect(loadBaseline('u1')).not.toBeNull()
    expect(Object.keys(loadBaseline('u1')!.tasks).sort()).toEqual(['t0', 't1', 't2'])
    expect(baselineWrites()).toBeGreaterThan(0)
  })

  it('オフラインの間の編集は、回線が戻ると送る', async () => {
    seed(3)
    await signIn()
    await syncNow()
    db.missing.add('tasks')
    act(() => useTaskStore.getState().updateTask('t1', { title: 'offline edit' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    for (let i = 0; i < 200 && useTaskStore.getState().syncState !== 'error'; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
    }
    expect(useTaskStore.getState().syncState).toBe('error')
    expect(serverRow('t1')!.title).toBe('task 1')
    db.missing.delete('tasks')
    await syncNow()
    expect(serverRow('t1')!.title).toBe('offline edit')
    expect(title('t1')).toBe('offline edit')
  })
})
