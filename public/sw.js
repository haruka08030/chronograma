/* Chronograma service worker
 * - オフラインでも開けるように、画面（HTML）はネットワーク優先・失敗時はキャッシュ、
 *   ビルド済みアセット（/assets/ はハッシュ付き）はキャッシュ優先
 * - 通知（Web Push）を表示し、タップで「今日の計画」を開く。記録の確認は「予定どおり」「記録する」のボタン付き
 * Supabase や Google など別オリジンの通信には触らない（同期は常に最新が必要なため）
 */
const CACHE = 'chronograma-v2'
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png']
const NAV_TIMEOUT_MS = 4000

/**
 * いまの index.html から辿れない /assets/ の控えを消す（デプロイのたびに古いハッシュ付きファイルが溜まらないように）。
 * 遅延読み込みの画面のファイルは index.html に直接は書かれず、読み込む側の JS に名前があるので、
 * 控えてある JS の中身もたどって「使われている」側に数える
 */
async function pruneAssets(html) {
  const cache = await caches.open(CACHE)
  const keep = new Set()
  const queue = []
  const collect = (text) => {
    // index.html は "/assets/x.js"、JS の中は "assets/x.js"（先読み一覧）や "./x.js"（import()）で書かれる
    for (const m of text.matchAll(/(?:assets\/|["'`]\.\/)([\w.-]+\.\w+)/g)) {
      const path = '/assets/' + m[1]
      if (keep.has(path)) continue
      keep.add(path)
      if (path.endsWith('.js')) queue.push(path)
    }
  }
  collect(html)
  // 入口の JS が控えに無いときは判断できないので消さない
  let foundEntry = false
  while (queue.length) {
    const hit = await cache.match(queue.shift())
    if (!hit) continue
    foundEntry = true
    collect(await hit.text())
  }
  if (!foundEntry) return
  const reqs = await cache.keys()
  await Promise.all(
    reqs
      .filter((r) => {
        const p = new URL(r.url).pathname
        return p.startsWith('/assets/') && !keep.has(p)
      })
      .map((r) => cache.delete(r)),
  )
}

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
    const fallback = () => (isAppShell ? caches.match('/') : caches.match(req))
    const network = fetch(req).then((res) => {
      if (res.ok && isAppShell) {
        const copy = res.clone()
        event.waitUntil(
          copy
            .text()
            .then((html) =>
              caches
                .open(CACHE)
                .then((c) => c.put('/', new Response(html, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/html' } })))
                .then(() => pruneAssets(html)),
            )
            .catch(() => {}),
        )
      }
      return res
    })
    event.respondWith(
      new Promise((resolve) => {
        let settled = false
        const settle = (res) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(res)
        }
        // 電波が弱いと fetch が失敗せずに待ち続けるので、一定時間で控えの画面を出す（控えが無ければそのまま待つ）
        const timer = setTimeout(() => {
          fallback().then((hit) => hit && settle(hit))
        }, NAV_TIMEOUT_MS)
        network.then(settle, () => fallback().then((hit) => settle(hit || Response.error())))
      }),
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
  let target = new URL(data.url || '/?view=planner', self.location.origin)
  // 通知の中身に別サイトの URL が入っていても、このアプリの外へは開かない
  if (target.origin !== self.location.origin) target = new URL('/?view=planner', self.location.origin)
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
