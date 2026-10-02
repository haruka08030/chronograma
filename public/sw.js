/* Chronograma service worker
 * - オフラインでも開けるように、画面（HTML）はネットワーク優先・失敗時はキャッシュ、
 *   ビルド済みアセット（/assets/ はハッシュ付き）はキャッシュ優先
 * - 通知（Web Push）を表示し、タップで「今日の計画」を開く。記録の確認は「予定どおり」「記録する」のボタン付き
 * Supabase や Google など別オリジンの通信には触らない（同期は常に最新が必要なため）
 */
const CACHE = 'chronograma-v2'
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    // アプリの画面だけを '/' に控える。/privacy.html などの別ページやエラー応答を控えると、
    // オフラインで開いたときにアプリの代わりにそれが出てしまう
    const isAppShell = !url.pathname.endsWith('.html')
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && isAppShell) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/', copy))
          }
          return res
        })
        .catch(() => (isAppShell ? caches.match('/') : caches.match(req))),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: event.data ? event.data.text() : 'Chronograma' }
  }
  const title = data.title || 'Chronograma'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || 'chronograma',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/?view=planner', taskId: data.taskId },
      // 記録の確認: 「予定どおり」「記録する」（対応していないブラウザでは本文のタップで記録の画面）
      actions: Array.isArray(data.actions) ? data.actions : undefined,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const target = new URL(data.url || '/?view=planner', self.location.origin)
  const taskId = data.taskId || target.searchParams.get('record')
  const asPlanned = event.action === 'as-planned'
  if (taskId && asPlanned) target.searchParams.set('as', 'planned')
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === target.origin) {
          w.postMessage(taskId ? { type: 'record', taskId, asPlanned } : { type: 'open-view', view: target.searchParams.get('view') })
          return w.focus()
        }
      }
      return self.clients.openWindow(target.href)
    }),
  )
})
