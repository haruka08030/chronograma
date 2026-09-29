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

const VIEWS: readonly SmartView[] = ['planner', 'all', 'today', 'upcoming', 'overdue', 'calendar', 'plan-vs-actual', 'activity-log', 'stats', 'habits']

/** `?view=planner` のような起動 URL（ショートカット・通知タップ）から開く画面 */
export function consumeLaunchView(): SmartView | null {
  const url = new URL(window.location.href)
  const view = url.searchParams.get('view') as SmartView | null
  const hadParams = url.searchParams.has('view') || url.searchParams.has('source')
  url.searchParams.delete('view')
  url.searchParams.delete('source')
  if (hadParams) window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  return view && VIEWS.includes(view) ? view : null
}

/**
 * Service Worker を登録する。開発サーバーでは HMR と干渉するので本番ビルドだけ。
 * `onOpenView` は通知タップで既存ウィンドウに戻ったときの画面切り替え。
 */
export function setupPwa(onOpenView: (view: SmartView) => void) {
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
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ type?: string; view?: string }>) => {
    const view = e.data?.view as SmartView | undefined
    if (e.data?.type === 'open-view' && view && VIEWS.includes(view)) onOpenView(view)
  })
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.error('[sw]', err))
    })
  }
}
