import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 購読の状態を見えるようにし、同期の途中で「無効」にしない（#495） */
const env = vi.hoisted(() => {
  // Web Push の公開鍵はモジュールを読むときに決まる
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AAAA')
  return { upsert: vi.fn(), deleteEq: vi.fn() }
})
vi.mock('./errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./errorReport')>()),
  reportFailure: vi.fn(),
}))
vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  getSupabase: () => ({ from: () => ({ upsert: env.upsert, delete: () => ({ eq: env.deleteEq }) }) }),
}))

const { syncWebPush, isWebPushActive, webPushStatus, listenForPushResubscribe } = await import('./webPush')

const args = {
  userId: 'u1',
  reminders: { planTime: '08:00' },
  eventReminderMinutes: null,
  dueReminders: false,
  recordPrompts: false,
  hasTaskReminders: false,
  activeTimer: null,
  lang: 'ja',
}
let permission = 'granted'
let swTarget: EventTarget

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  env.upsert.mockReset().mockResolvedValue({ error: null })
  env.deleteEq.mockReset().mockResolvedValue({ error: null })
  permission = 'granted'
  const sub = { endpoint: 'https://push.example/new', toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: vi.fn() }
  const reg = { pushManager: { getSubscription: async () => sub, subscribe: vi.fn() } }
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', {
    get permission() {
      return permission
    },
  })
  swTarget = new EventTarget()
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => reg,
      ready: Promise.resolve(reg),
      addEventListener: swTarget.addEventListener.bind(swTarget),
      removeEventListener: swTarget.removeEventListener.bind(swTarget),
    },
  })
})
afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.unstubAllGlobals()
})

describe('syncWebPush', () => {
  it('保存できたら「閉じていても届く」、保存に失敗したら「開いている間だけ」', async () => {
    await syncWebPush(args)
    expect(webPushStatus()).toBe('active')
    expect(isWebPushActive()).toBe(true)

    env.upsert.mockResolvedValue({ error: { message: 'x', code: 'P0001' } })
    await syncWebPush(args)
    expect(webPushStatus()).toBe('failed')
    expect(isWebPushActive()).toBe(false)
  })

  it('同期の途中は前の状態のまま（タブの通知と二重にならない）', async () => {
    await syncWebPush(args)
    let resolve!: (v: { error: null }) => void
    env.upsert.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    const running = syncWebPush(args)
    // 保存を待っている間
    await vi.waitFor(() => expect(env.upsert).toHaveBeenCalledTimes(2))
    expect(isWebPushActive()).toBe(true)
    resolve({ error: null })
    await running
    expect(isWebPushActive()).toBe(true)
  })

  it('通知が未許可なら「開いている間だけ」、全部切っていれば off', async () => {
    permission = 'default'
    await syncWebPush(args)
    expect(webPushStatus()).toBe('tab-only')
    permission = 'granted'
    await syncWebPush({ ...args, reminders: { planTime: null } })
    expect(webPushStatus()).toBe('off')
  })
})

describe('VAPID の鍵を替えたあと', () => {
  function stubSubscription(key: number[] | null) {
    const current = {
      endpoint: 'https://push.example/old-key',
      options: { applicationServerKey: key ? new Uint8Array(key).buffer : null },
      toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }),
      unsubscribe: vi.fn(async () => true),
    }
    const fresh = { endpoint: 'https://push.example/new-key', toJSON: () => ({ keys: { p256dh: 'p2', auth: 'a2' } }) }
    const subscribe = vi.fn<(options: { applicationServerKey: Uint8Array }) => Promise<typeof fresh>>(async () => fresh)
    const reg = { pushManager: { getSubscription: async () => current, subscribe } }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => reg, ready: Promise.resolve(reg) },
    })
    return { current, subscribe }
  }

  it('前の鍵の購読は外して今の鍵で購読し直し、新しい購読を保存する', async () => {
    const { current, subscribe } = stubSubscription([9, 9, 9])
    await syncWebPush(args)
    expect(env.deleteEq).toHaveBeenCalledWith('endpoint', 'https://push.example/old-key')
    expect(current.unsubscribe).toHaveBeenCalled()
    expect(subscribe).toHaveBeenCalledTimes(1)
    // 'AAAA' は 0 が 3 バイト
    expect(Array.from(subscribe.mock.calls[0][0].applicationServerKey)).toEqual([0, 0, 0])
    expect(env.upsert).toHaveBeenCalledTimes(1)
    expect(env.upsert.mock.calls[0][0]).toMatchObject({ endpoint: 'https://push.example/new-key' })
    expect(webPushStatus()).toBe('active')
  })

  it('今の鍵の購読と、鍵の分からない購読はそのまま使う', async () => {
    for (const key of [[0, 0, 0], null]) {
      env.upsert.mockClear()
      const { current, subscribe } = stubSubscription(key)
      await syncWebPush(args)
      expect(current.unsubscribe).not.toHaveBeenCalled()
      expect(subscribe).not.toHaveBeenCalled()
      expect(env.upsert.mock.calls[0][0]).toMatchObject({ endpoint: 'https://push.example/old-key' })
    }
  })
})

describe('listenForPushResubscribe', () => {
  it('SW が付け直したら、古い購読の行を消して新しい購読を保存する', async () => {
    await syncWebPush(args)
    env.upsert.mockClear()
    const stop = listenForPushResubscribe()
    swTarget.dispatchEvent(new MessageEvent('message', { data: { type: 'push-resubscribed', oldEndpoint: 'https://push.example/old' } }))
    await vi.waitFor(() => expect(env.upsert).toHaveBeenCalledTimes(1))
    expect(env.deleteEq).toHaveBeenCalledWith('endpoint', 'https://push.example/old')
    expect(env.upsert.mock.calls[0][0]).toMatchObject({ endpoint: 'https://push.example/new' })
    stop()
  })
})
