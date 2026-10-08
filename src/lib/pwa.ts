/**
 * PWA（ホーム画面に追加）まわり: Service Worker 登録・インストール案内・通知タップからの画面遷移。
 */
import type { SmartView } from '../store/taskStore'
import { toSmartView } from './viewUrl'
import { parseStartParam, type QuickStartRequest } from './quickStart'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** ホーム画面から起動しているか（iOS は navigator.standalone） */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iOS / iPadOS の Safari 系（インストールは共有メニューから手動） */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export type InstallAvailability = 'installed' | 'prompt' | 'ios' | 'unavailable'

export function installAvailability(): InstallAvailability {
  if (isStandalone()) return 'installed'
  if (deferredPrompt) return 'prompt'
  if (isIos()) return 'ios'
  return 'unavailable'
}

export function subscribeInstallAvailability(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** ブラウザのインストールダイアログを出す（Chrome / Edge / Android） */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  const p = deferredPrompt
  deferredPrompt = null
  await p.prompt()
  const { outcome } = await p.userChoice
  notify()
  return outcome === 'accepted'
}

/** 記録の確認の通知から: 予定どおりに記録する / 記録を入れる画面を開く */
export interface RecordLaunch {
  taskId: string
  asPlanned: boolean
}

/** 開始前・締切の通知から: その To-Do・予定の詳細を開く。`date` は通知の日（予定の日・締切日） */
export interface TaskLaunch {
  taskId: string
  date: string | null
}

/** 止め忘れの通知の「止める」から: そのタイマー（開始時刻。分からなければ null）を止める */
export interface TimerStopLaunch {
  startedAt: string | null
}

export interface LaunchHandlers {
  openView: (view: SmartView) => void
  record: (launch: RecordLaunch) => void
  openTask: (launch: TaskLaunch) => void
  stopTimer: (launch: TimerStopLaunch) => void
  /** ホーム画面のアイコンを長押しした「追加」（`?add=1`） */
  add: () => void
  /** 開いてすぐ記録を始める（`?start=last`、アイコン長押しの「前回の記録を再開」。`quickStart.ts`） */
  start: (request: QuickStartRequest) => void
}

/**
 * 通知タップの `?record=<id>&as=planned`・`?task=<id>&date=<日>`・`?stop-timer=<開始時刻>`、アイコン長押しの `?add=1` / `?start=last` のような起動 URL を読んで消す。読んだら `handlers` を呼ぶ。
 * 画面の指定（`?view=` / `?list=`）は `urlHistory.ts` が読む
 */
export function consumeLaunch(handlers: LaunchHandlers) {
  const url = new URL(window.location.href)
  const record = url.searchParams.get('record')
  const asPlanned = url.searchParams.get('as') === 'planned'
  const nonce = url.searchParams.get('launch')
  const add = url.searchParams.get('add') === '1'
  const task = url.searchParams.get('task')
  const date = url.searchParams.get('date')
  const stopTimer = url.searchParams.get('stop-timer')
  const start = parseStartParam(url.searchParams.get('start'))
  // 読んだら URL から消す（読み込み直しで同じ操作をもう一度しない）
  const keys = ['source', 'record', 'as', 'launch', 'add', 'task', 'date', 'stop-timer', 'start']
  const hadParams = keys.some((k) => url.searchParams.has(k))
  for (const k of keys) url.searchParams.delete(k)
  if (hadParams) window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  if (add) handlers.add()
  if (task && !record) handlers.openTask({ taskId: task, date: launchDate(date) })
  // 止める: 通知から開いたときだけ（ただのリンクではタイマーの見える今日の計画が開くだけ）
  if (stopTimer) {
    void consumeLaunchMark(nonce).then((ok) => ok && handlers.stopTimer({ startedAt: stopTimer === '1' ? null : stopTimer }))
  }
  if (start) handlers.start(start)
  if (!record) return
  if (!asPlanned) {
    handlers.record({ taskId: record, asPlanned: false })
    return
  }
  // 通知から開いたときだけ確かめずに記録する。印が無ければ（ただのリンク）時刻を直せる画面を開くだけ
  void consumeLaunchMark(nonce).then((ok) => handlers.record({ taskId: record, asPlanned: ok }))
}

/** 起動 URL・通知の日付（`YYYY-MM-DD` だけ受け取る） */
function launchDate(raw: unknown): string | null {
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

async function consumeLaunchMark(nonce: string | null): Promise<boolean> {
  if (!nonce || typeof caches === 'undefined') return false
  try {
    const cache = await caches.open('chronograma-launch')
    const key = `/__launch/${nonce}`
    const hit = await cache.match(key)
    if (!hit) return false
    await cache.delete(key)
    return true
  } catch {
    return false
  }
}

/**
 * Service Worker を登録する。開発サーバーでは HMR と干渉するので本番ビルドだけ。
 * `onOpenView` は通知タップで既存ウィンドウに戻ったときの画面切り替え。
 */
export function setupPwa(handlers: LaunchHandlers) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })

  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener(
    'message',
    (
      e: MessageEvent<{
        type?: string
        view?: string
        taskId?: string
        asPlanned?: boolean
        date?: string | null
        startedAt?: string | null
      }>,
    ) => {
      const view = toSmartView(e.data?.view)
      if (e.data?.type === 'open-view' && view) handlers.openView(view)
      if (e.data?.type === 'stop-timer') handlers.stopTimer({ startedAt: typeof e.data.startedAt === 'string' ? e.data.startedAt : null })
      if (e.data?.type === 'open-task' && e.data.taskId) handlers.openTask({ taskId: e.data.taskId, date: launchDate(e.data.date) })
      if (e.data?.type === 'record' && e.data.taskId) handlers.record({ taskId: e.data.taskId, asPlanned: e.data.asPlanned === true })
    },
  )
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => watchForUpdates(reg))
        .catch((err) => console.error('[sw]', err))
    })
  }
}

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

/**
 * 新しい版を取り込む。ホーム画面のアプリは開きっぱなしで再読み込みされないので、
 * 画面に戻ってきたときに新しい sw.js があるか確かめ（30 分に 1 回まで）、
 * 新しい Service Worker に切り替わったら、使っている最中を避けて画面が隠れたときに読み込み直す
 */
function watchForUpdates(reg: ServiceWorkerRegistration) {
  let lastCheck = Date.now()
  // 最初から Service Worker の下で開いていたときだけ（初回インストール時の切り替えでは読み込み直さない）
  let hadController = navigator.serviceWorker.controller !== null
  let reloadPending = false

  const reloadIfHidden = () => {
    if (reloadPending && document.visibilityState === 'hidden') window.location.reload()
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true
      return
    }
    reloadPending = true
    reloadIfHidden()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      reloadIfHidden()
      return
    }
    if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return
    lastCheck = Date.now()
    reg.update().catch(() => {})
  })
}
