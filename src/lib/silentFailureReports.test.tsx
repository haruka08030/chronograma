import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/task'
import type { DailyReminders } from '../store/taskStore'

/**
 * 黙って続けていた失敗（#285）が `reportFailure` で記録に回るか。送り方（上限・ためておく）は `errorReport.test.ts`。
 * 端末の保存・自動バックアップ・連携の取り込み・Web Push の購読をそれぞれ失敗させる
 */
const env = vi.hoisted(() => {
  // Web Push の公開鍵はモジュールを読むときに決まる
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AAAA')
  return {
    upsert: vi.fn(),
    deleteEq: vi.fn(),
    fetchCanvas: vi.fn(),
    fetchNotion: vi.fn(),
  }
})

vi.mock('./errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./errorReport')>()),
  reportFailure: vi.fn(),
}))
vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: () => ({ upsert: env.upsert, delete: () => ({ eq: env.deleteEq }) }),
  }),
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: { access_token: 't' }, loading: false }),
}))
vi.mock('./tabLeader', () => ({ isLeaderTab: () => true }))
vi.mock('./canvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./canvas')>()),
  fetchCanvasItems: env.fetchCanvas,
}))
vi.mock('./notion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./notion')>()),
  fetchNotionPages: env.fetchNotion,
}))

const { reportFailure } = await import('./errorReport')
const { useTaskStore } = await import('../store/taskStore')
const { PERSIST_STORAGE_KEY, STORE_VERSION } = await import('../store/storeConstants')
const { CanvasRequestError } = await import('./canvas')
const { NotionRequestError } = await import('./notion')
const { useCanvasSync } = await import('../hooks/useCanvasSync')
const { useNotionSync } = await import('../hooks/useNotionSync')
const { syncWebPush, detachWebPush } = await import('./webPush')
const { localizeGoogleError } = await import('./googleCalendar')

const reported = () => vi.mocked(reportFailure).mock.calls

beforeEach(() => {
  vi.mocked(reportFailure).mockClear()
  env.upsert.mockReset()
  env.deleteEq.mockReset()
  env.fetchCanvas.mockReset()
  env.fetchNotion.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('端末の保存', () => {
  /**
   * ストアと自動バックアップは部品のテストの準備（`src/test/setup.ts`）が先に読み込むので、上の差し替えが効かない。
   * 読み込み直して、差し替えた送信を使う版で確かめる
   */
  async function freshModules() {
    vi.resetModules()
    const report = vi.mocked((await import('./errorReport')).reportFailure)
    const { useTaskStore } = await import('../store/taskStore')
    const { saveAutoBackup } = await import('./autoBackup')
    return { calls: () => report.mock.calls, useTaskStore, saveAutoBackup }
  }

  it('本体の保存に失敗したら storage / save', async () => {
    const { calls, useTaskStore } = await freshModules()
    const quota = new DOMException('full', 'QuotaExceededError')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (key === PERSIST_STORAGE_KEY) throw quota
    })
    act(() => useTaskStore.setState({ dailyCapacityMinutes: 123 }))
    expect(calls()).toContainEqual(['storage', 'save', quota])
  })

  it('保存データが読めなかったら storage / load（中身は送らない）', async () => {
    const { calls, useTaskStore } = await freshModules()
    localStorage.setItem(PERSIST_STORAGE_KEY, '{"state": not json, "title": "秘密の予定"')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await useTaskStore.persist.rehydrate()
    const call = calls().find(([kind, stage]) => kind === 'storage' && stage === 'load')
    expect(call).toBeDefined()
    expect(call?.[3]).toBeUndefined()
  })

  it('保存データの行が壊れていたら storage / load-rows', async () => {
    const { calls, useTaskStore } = await freshModules()
    localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify({ state: { tasks: '秘密の予定' }, version: STORE_VERSION }))
    await useTaskStore.persist.rehydrate()
    expect(calls()).toContainEqual(['storage', 'load-rows', 'unreadable rows were dropped'])
  })

  it('自動バックアップに失敗したら storage / auto-backup（控えの種類だけ）', async () => {
    const { calls, saveAutoBackup } = await freshModules()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // jsdom には IndexedDB が無いので開けない
    const ok = await saveAutoBackup('daily', '2026-10-08', [{ id: 't1' } as Task], '{"tasks":["秘密"]}', null)
    expect(ok).toBe(false)
    expect(calls()).toHaveLength(1)
    expect(calls()[0].slice(0, 2)).toEqual(['storage', 'auto-backup'])
    expect(calls()[0][3]).toEqual({ kind: 'daily' })
  })
})

describe('連携の取り込み', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // 初回はクラウド同期の後に取り込む
    useTaskStore.setState({ lastSyncedAt: '2026-10-08T00:00:00.000Z' })
  })

  it('Canvas の取り込みに失敗したら integration / canvas（エラーコード付き）', async () => {
    const err = new CanvasRequestError('canvas_unauthorized', 'token expired')
    env.fetchCanvas.mockRejectedValue(err)
    const { unmount } = renderHook(() => useCanvasSync())
    await vi.waitFor(() => expect(reported()).toContainEqual(['integration', 'canvas', err, { code: 'canvas_unauthorized' }]))
    unmount()
  })

  it('Notion の取り込みに失敗したら integration / notion', async () => {
    const err = new NotionRequestError(null, 'database not shared')
    env.fetchNotion.mockRejectedValue(err)
    const { unmount } = renderHook(() => useNotionSync())
    await vi.waitFor(() => expect(reported()).toContainEqual(['integration', 'notion', err, { code: null }]))
    unmount()
  })

  it('Google の設定の誤りは integration / google', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localizeGoogleError('invalid_client', (key) => key)
    expect(reported()).toContainEqual(['integration', 'google', 'invalid_client'])
  })

  it('利用者が直せる Google のエラー（期限切れ）は送らない', () => {
    localizeGoogleError('authorization expired', (key) => key)
    expect(reported()).toHaveLength(0)
  })
})

describe('Web Push の購読', () => {
  const reminders: DailyReminders = { planTime: '08:00' }
  const args = {
    userId: 'u1',
    reminders,
    eventReminderMinutes: null,
    dueReminders: false,
    recordPrompts: false,
    hasTaskReminders: false,
    activeTimer: null,
    lang: 'ja',
  }
  let sub: { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> } | null
  let subscribe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    sub = { endpoint: 'https://fcm.googleapis.com/x', toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: vi.fn() }
    subscribe = vi.fn()
    const reg = { pushManager: { getSubscription: async () => sub, subscribe } }
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { permission: 'granted' })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => reg, ready: Promise.resolve(reg) },
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('購読できなかったら push / subscribe', async () => {
    sub = null
    const err = new DOMException('denied', 'NotAllowedError')
    subscribe.mockRejectedValue(err)
    await syncWebPush(args)
    expect(reported()).toContainEqual(['push', 'subscribe', err])
  })

  it('購読を保存できなかったら push / save（エラーコード付き）', async () => {
    env.upsert.mockResolvedValue({ error: { message: 'row_limit_exceeded', code: 'P0001' } })
    await syncWebPush(args)
    expect(reported()).toContainEqual(['push', 'save', 'row_limit_exceeded', { code: 'P0001' }])
  })

  it('通知を全部切ったときに購読の行を消せなかったら push / delete', async () => {
    env.deleteEq.mockResolvedValue({ error: { message: 'permission denied' } })
    await syncWebPush({ ...args, reminders: { planTime: null } })
    expect(reported()).toContainEqual(['push', 'delete', 'permission denied'])
    expect(sub?.unsubscribe).toHaveBeenCalled()
  })

  it('ログアウトのときに購読の行を消せなかったら push / detach:delete', async () => {
    env.deleteEq.mockResolvedValue({ error: { message: 'JWT expired' } })
    await detachWebPush()
    expect(reported()).toContainEqual(['push', 'detach:delete', 'JWT expired'])
  })

  it('購読を外せなかったら push / detach', async () => {
    env.deleteEq.mockResolvedValue({ error: null })
    const err = new Error('unsubscribe failed')
    sub!.unsubscribe.mockRejectedValue(err)
    await detachWebPush()
    expect(reported()).toContainEqual(['push', 'detach', err])
  })
})
