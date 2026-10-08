/**
 * `public/sw.js` を関数として動かすテスト用の台。`self`・`caches`・`clients` の偽物を渡し、
 * `push` / `notificationclick` を起こして、出した通知・開いた URL・送ったメッセージを見る
 */
import swSource from '../../public/sw.js?raw'

type Listener = (event: unknown) => void

export interface FakeWindow {
  url: string
  messages: unknown[]
  focused: boolean
}

export interface ShownNotification {
  title: string
  options: { tag?: string; data?: Record<string, unknown>; actions?: { action: string; title: string }[]; body?: string }
}

export function loadServiceWorker(opts: { windows?: string[] } = {}) {
  const origin = 'https://app.test'
  const listeners = new Map<string, Listener>()
  const cacheStore = new Map<string, Map<string, string>>()
  const windows: FakeWindow[] = (opts.windows ?? []).map((url) => ({ url, messages: [], focused: false }))
  const opened: string[] = []
  const shown: ShownNotification[] = []
  let uuid = 0

  const caches = {
    open: async (name: string) => {
      const store = cacheStore.get(name) ?? new Map<string, string>()
      cacheStore.set(name, store)
      return {
        put: async (key: string, res: Response) => void store.set(key, await res.text()),
        match: async (key: string) => (store.has(key) ? new Response(store.get(key)) : undefined),
        delete: async (key: string) => store.delete(key),
      }
    },
    keys: async () => [...cacheStore.keys()],
    match: async () => undefined,
    delete: async (name: string) => cacheStore.delete(name),
  }

  const self = {
    location: { origin },
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    crypto: { randomUUID: () => `nonce-${++uuid}` },
    registration: {
      showNotification: async (title: string, options: ShownNotification['options']) => void shown.push({ title, options }),
    },
    clients: {
      matchAll: async () =>
        windows.map((w) => ({
          url: w.url,
          postMessage: (m: unknown) => w.messages.push(m),
          focus: async () => {
            w.focused = true
          },
        })),
      openWindow: async (href: string) => void opened.push(href),
      claim: async () => {},
    },
    skipWaiting: async () => {},
  }

  // 本物の `self` / `caches` の代わりに偽物を引数で渡す（ほかの名前はテストの環境のもの）
  new Function('self', 'caches', 'fetch', swSource)(self, caches, () => Promise.reject(new Error('offline')))

  /** イベントを起こし、`waitUntil` に渡したものが終わるまで待つ */
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = []
    listeners.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) })
    await Promise.all(waits)
  }

  return {
    origin,
    windows,
    opened,
    shown,
    /** 1 回きりの印（launch）が控えにあるか */
    hasLaunchMark: async (nonce: string) => (await caches.open('chronograma-launch')).match(`/__launch/${nonce}`).then(Boolean),
    push: (payload: unknown) => dispatch('push', { data: { json: () => payload, text: () => JSON.stringify(payload) } }),
    /** 通知（`push` で出したものの `data`）を押す。`action` はボタン */
    click: async (data: Record<string, unknown>, action = '') => {
      let closed = false
      await dispatch('notificationclick', {
        action,
        notification: {
          data,
          close: () => {
            closed = true
          },
        },
      })
      return { closed }
    },
  }
}
