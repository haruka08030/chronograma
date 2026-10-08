/**
 * Web Push（アプリを閉じていても届く通知）の購読管理。
 * 購読は端末ごとに `push_subscriptions` に保存し、送信は Edge Function `daily-reminders` が cron で行う。
 * 使えない環境（未ログイン / VAPID 未設定 / 開発サーバーで SW 無し / iOS でホーム画面未追加）では
 * 何もせず、タブを開いている間だけのローカル通知（`localReminders.ts`）にフォールバックする。
 */
import type { ActiveTimer, DailyReminders } from '../store/taskStore'
import { getSupabase } from './supabase'
import { appTimeZone } from './timeZone'

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

type SyncWebPushArgs = {
  userId: string | null
  reminders: DailyReminders
  eventReminderMinutes: number | null
  /** 締切の前 */
  dueReminders: boolean
  /** 予定のあとの記録の確認 */
  recordPrompts: boolean
  /** タスクごとに通知を決めたものがあるか（既定を全部オフにしていても購読する） */
  hasTaskReminders: boolean
  /** 動いているタイマー（止め忘れの通知） */
  activeTimer: ActiveTimer | null
  lang: string
}
/** 最後に反映した設定（アカウントが替わって購読を外したあと、同じ設定で購読し直す） */
let lastSyncArgs: SyncWebPushArgs | null = null

/** 最後の設定で購読し直す（`clearPreviousAccount`） */
export function resyncWebPush(): Promise<void> {
  return lastSyncArgs ? syncWebPush(lastSyncArgs) : Promise.resolve()
}

/**
 * 通知時刻の変更をサーバーの購読に反映する。どちらもオフなら購読を解除して行を消す。
 * 権限が未許可なら何もしない（許可ダイアログはユーザー操作から出す）。
 */
export async function syncWebPush(args: SyncWebPushArgs): Promise<void> {
  const { userId, reminders, eventReminderMinutes, dueReminders, recordPrompts, hasTaskReminders, activeTimer, lang } = args
  lastSyncArgs = args
  pushActive = false
  const supabase = getSupabase()
  if (!userId || !supabase || !isWebPushSupported() || Notification.permission !== 'granted') return
  const reg = await readyRegistration()
  if (!reg) return

  const wantsAny = Boolean(
    reminders.planTime || eventReminderMinutes != null || dueReminders || recordPrompts || hasTaskReminders || activeTimer,
  )
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
  const row = {
    endpoint: sub.endpoint,
    user_id: userId,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    // サーバーは予定の時刻をこのタイムゾーンで読む（列はアプリのタイムゾーンの壁時計）
    timezone: appTimeZone(),
    lang: lang.startsWith('ja') ? 'ja' : 'en',
    plan_time: reminders.planTime,
    wrap_up_time: null,
    event_reminder_minutes: eventReminderMinutes,
    due_reminders: dueReminders,
    updated_at: new Date().toISOString(),
  }
  // 記録の確認・止め忘れの列。古い DB では外して送り直す
  const extra = {
    record_prompts: recordPrompts,
    timer_started_at: activeTimer?.startedAt ?? null,
    timer_title: activeTimer?.taskTitle?.slice(0, 2000) ?? null,
  }
  let { error } = await supabase.from('push_subscriptions').upsert({ ...row, ...extra }, { onConflict: 'endpoint' })
  if (error && /record_prompts|timer_/.test(error.message)) {
    ;({ error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' }))
  }
  if (error) {
    console.error('[push] save failed', error.message)
    return
  }
  pushActive = true
}

/**
 * この端末の購読を外す（ログアウト・アカウント削除のとき）。外さないと、共有の PC で前の人の
 * 予定や締切の通知が届き続け、次にログインした人は同じ endpoint の行を RLS で上書きできず通知が来ない。
 * 行は消せるうち（ログアウト前）に消し、消せなくても購読を解除すれば endpoint が失効してサーバーが片付ける。
 */
export async function detachWebPush(): Promise<void> {
  pushActive = false
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await readyRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    const supabase = getSupabase()
    if (supabase) {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      if (error) console.error('[push] delete on sign-out failed', error.message)
    }
    await sub.unsubscribe()
  } catch (err) {
    console.error('[push] detach failed', err)
  }
}
