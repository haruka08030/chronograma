/**
 * Web Push（アプリを閉じていても届く朝・夕方の通知）の購読管理。
 * 購読は端末ごとに `push_subscriptions` に保存し、送信は Edge Function `daily-reminders` が cron で行う。
 * 使えない環境（未ログイン / VAPID 未設定 / 開発サーバーで SW 無し / iOS でホーム画面未追加）では
 * 何もせず、タブを開いている間だけのローカル通知（`dailyReminders.ts`）にフォールバックする。
 */
import type { DailyReminders } from '../store/taskStore'
import { getSupabase } from './supabase'

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()

/** この端末で Web Push の購読が有効か（有効ならローカル通知は出さない＝二重通知防止） */
let pushActive = false
export const isWebPushActive = () => pushActive

export function isWebPushSupported(): boolean {
  return (
    Boolean(VAPID_PUBLIC_KEY) &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** SW が登録済みならその registration（開発サーバーでは登録しないので null） */
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? navigator.serviceWorker.ready : null
}

/**
 * 通知時刻の変更をサーバーの購読に反映する。どちらもオフなら購読を解除して行を消す。
 * 権限が未許可なら何もしない（許可ダイアログはユーザー操作から出す）。
 */
export async function syncWebPush(userId: string | null, reminders: DailyReminders, lang: string): Promise<void> {
  pushActive = false
  const supabase = getSupabase()
  if (!userId || !supabase || !isWebPushSupported() || Notification.permission !== 'granted') return
  const reg = await readyRegistration()
  if (!reg) return

  const wantsAny = Boolean(reminders.planTime || reminders.wrapUpTime)
  let sub = await reg.pushManager.getSubscription()

  if (!wantsAny) {
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
    return
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      })
    } catch (err) {
      console.error('[push] subscribe failed', err)
      return
    }
  }

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint,
      user_id: userId,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      lang: lang.startsWith('ja') ? 'ja' : 'en',
      plan_time: reminders.planTime,
      wrap_up_time: reminders.wrapUpTime,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    console.error('[push] save failed', error.message)
    return
  }
  pushActive = true
}
