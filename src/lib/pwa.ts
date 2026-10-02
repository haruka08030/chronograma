/**
 * PWA（ホーム画面に追加）まわり: Service Worker 登録・インストール案内・通知タップからの画面遷移。
 */
import type { SmartView } from '../store/taskStore'

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

const VIEWS: readonly SmartView[] = ['planner', 'all', 'today', 'upcoming', 'overdue', 'calendar', 'stats', 'habits']

/** 記録の確認の通知から: 予定どおりに記録する / 記録を入れる画面を開く */
export interface RecordLaunch {
  taskId: string
  asPlanned: boolean
}

export interface LaunchHandlers {
  openView: (view: SmartView) => void
  record: (launch: RecordLaunch) => void
}

/**
 * `?view=planner` や `?record=<id>&as=planned` のような起動 URL（ショートカット・通知タップ）を読んで消す。
 * 読んだら `handlers` を呼ぶ
 */
export function consumeLaunch(handlers: LaunchHandlers) {
  const url = new URL(window.location.href)
  const raw = url.searchParams.get('view')
  // 統合した旧画面へのショートカットは統合先で開く（記録→今日、予定と記録→カレンダー）
  const view = (raw === 'activity-log' ? 'planner' : raw === 'plan-vs-actual' ? 'calendar' : raw) as SmartView | null
  const record = url.searchParams.get('record')
  const asPlanned = url.searchParams.get('as') === 'planned'
  const keys = ['view', 'source', 'record', 'as']
  const hadParams = keys.some((k) => url.searchParams.has(k))
  for (const k of keys) url.searchParams.delete(k)
  if (hadParams) window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  if (view && VIEWS.includes(view)) handlers.openView(view)
  if (record) handlers.record({ taskId: record, asPlanned })
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
    (e: MessageEvent<{ type?: string; view?: string; taskId?: string; asPlanned?: boolean }>) => {
      const view = e.data?.view as SmartView | undefined
      if (e.data?.type === 'open-view' && view && VIEWS.includes(view)) handlers.openView(view)
      if (e.data?.type === 'record' && e.data.taskId) handlers.record({ taskId: e.data.taskId, asPlanned: e.data.asPlanned === true })
    },
  )
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.error('[sw]', err))
    })
  }
}
