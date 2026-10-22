/**
 * Web Push（アプリを閉じていても届く通知）の購読管理。
 * 購読は端末ごとに `push_subscriptions` に保存し、送信は Edge Function `daily-reminders` が cron で行う。
 * 使えない環境（未ログイン / VAPID 未設定 / 開発サーバーで SW 無し / iOS でホーム画面未追加）では
 * 何もせず、タブを開いている間だけのローカル通知（`localReminders.ts`）にフォールバックする。
 */
import type { ActiveTimer, DailyReminders } from '../store/taskStore'
import { getSupabase } from './supabase'
import { appTimeZone } from './timeZone'
import { reportFailure } from './errorReport'

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()

/** この端末で Web Push の購読が有効か（有効ならローカル通知は出さない＝二重通知防止） */
let pushActive = false
export const isWebPushActive = () => pushActive

/**
 * この端末の通知の届き方（通知の設定に出す）。
 * - active: アプリを閉じていても届く
 * - failed: 購読・保存に失敗した（開いている間だけ）
 * - unsupported: このブラウザは Web Push を使えない（開いている間だけ）
 * - tab-only: 未ログイン・通知が未許可など（開いている間だけ）
 * - off: 通知を全部切っている / unknown: まだ確かめていない
 */
export type WebPushStatus = 'unknown' | 'off' | 'active' | 'failed' | 'unsupported' | 'tab-only'
let pushStatus: WebPushStatus = 'unknown'
const statusListeners = new Set<() => void>()
export const webPushStatus = () => pushStatus
export function subscribeWebPushStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}
function setPush(status: WebPushStatus) {
  pushActive = status === 'active'
  if (status === pushStatus) return
  pushStatus = status
  statusListeners.forEach((l) => l())
}

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

/**
 * 購読がいまの公開鍵で作られたか。VAPID の鍵を替えると、前の鍵の購読にはプッシュサービスが 403 を返し、サーバーが行を消す。
 * 鍵が違う購読は使い続けず作り直す。ブラウザが鍵を教えないとき（`null`）は比べられないのでそのまま使う
 */
export function subscribedWithKey(sub: PushSubscription, publicKey: string): boolean {
  const key = sub.options?.applicationServerKey
  if (!key) return true
  const have = new Uint8Array(key)
  const want = urlBase64ToUint8Array(publicKey)
  return have.length === want.length && have.every((b, i) => b === want[i])
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
  lastSyncArgs = args
  // 同期の途中は前の状態のまま（途中で「無効」にすると、その間にタブの通知も出て二重になる）。
  // 重なって呼ばれたら、最後に始めたものの結果だけ使う
  const generation = ++syncGeneration
  const status = await syncSubscription(args)
  if (generation === syncGeneration) setPush(status)
}

let syncGeneration = 0

async function syncSubscription(args: SyncWebPushArgs): Promise<WebPushStatus> {
  const { userId, reminders, eventReminderMinutes, dueReminders, recordPrompts, hasTaskReminders, activeTimer, lang } = args
  const supabase = getSupabase()
  if (!isWebPushSupported()) return 'unsupported'
  if (!userId || !supabase || Notification.permission !== 'granted') return 'tab-only'
  const reg = await readyRegistration()
  if (!reg) return 'tab-only'

  const wantsAny = Boolean(
    reminders.planTime ||
    reminders.wrapUpTime ||
    eventReminderMinutes != null ||
    dueReminders ||
    recordPrompts ||
    hasTaskReminders ||
    activeTimer,
  )
  let sub = await reg.pushManager.getSubscription()

  if (!wantsAny) {
    if (sub) {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      if (error) reportFailure('push', 'delete', error.message)
      await sub.unsubscribe()
    }
    return 'off'
  }

  // 鍵を替えたあとの前の鍵の購読は外して作り直す（そのまま保存し直すと、送るたびに 403 で消される）
  if (sub && !subscribedWithKey(sub, VAPID_PUBLIC_KEY!)) {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    if (error) reportFailure('push', 'rekey:delete', error.message)
    try {
      await sub.unsubscribe()
    } catch (err) {
      reportFailure('push', 'rekey:unsubscribe', err)
    }
    sub = null
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      })
    } catch (err) {
      console.error('[push] subscribe failed', err)
      reportFailure('push', 'subscribe', err)
      return 'failed'
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
    wrap_up_time: reminders.wrapUpTime ?? null,
    event_reminder_minutes: eventReminderMinutes,
    due_reminders: dueReminders,
    updated_at: new Date().toISOString(),
    // 記録の確認・止め忘れ（列が無いと言われても外して送り直さない。外すとこの 2 つの通知が黙って止まっていた）。
    // 止め忘れの 2 列は、共有のタイマー（`user_active_timer`）の行があればサーバーがその値にする（`019`。全部の購読に同じタイマー）
    record_prompts: recordPrompts,
    timer_started_at: activeTimer?.startedAt ?? null,
    timer_title: activeTimer?.taskTitle?.slice(0, 2000) ?? null,
  }
  const { error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
  if (error) {
    console.error('[push] save failed', error.message)
    reportFailure('push', 'save', error.message, { code: error.code ?? null })
    return 'failed'
  }
  return 'active'
}

/** アプリを開いた・表に戻ったときに付け直す間隔の下限（フォーカスのたびに保存しない） */
const RESYNC_MIN_MS = 10 * 60_000
let lastResyncAt = 0

/**
 * 購読を確かめ直す（表に戻ったとき・SW がブラウザによる購読の更新を知らせたとき）。
 * ブラウザが購読を更新すると、サーバーの古い購読は失効して消えるので、新しい購読を保存し直さないと通知が黙って止まる。
 * `force` でなければ、前に確かめてから少し間をあける（失敗していれば待たない）
 */
export function refreshWebPush(force = false): Promise<void> {
  const now = Date.now()
  if (!force && pushStatus === 'active' && now - lastResyncAt < RESYNC_MIN_MS) return Promise.resolve()
  lastResyncAt = now
  return resyncWebPush()
}

/**
 * SW からの「購読を付け直した」（`pushsubscriptionchange`）を受けて、新しい購読を保存し、古い購読の行を消す。
 * 外すときの関数を返す
 */
export function listenForPushResubscribe(): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const onMessage = (e: MessageEvent<{ type?: string; oldEndpoint?: string | null }>) => {
    if (e.data?.type !== 'push-resubscribed') return
    const old = typeof e.data.oldEndpoint === 'string' ? e.data.oldEndpoint : null
    void (async () => {
      if (old) {
        const { error } = (await getSupabase()?.from('push_subscriptions').delete().eq('endpoint', old)) ?? { error: null }
        if (error) reportFailure('push', 'resubscribe:delete', error.message)
      }
      await refreshWebPush(true)
    })()
  }
  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => navigator.serviceWorker.removeEventListener('message', onMessage)
}

/**
 * この端末の購読を外す（ログアウト・アカウント削除のとき）。外さないと、共有の PC で前の人の
 * 予定や締切の通知が届き続け、次にログインした人は同じ endpoint の行を RLS で上書きできず通知が来ない。
 * 行は消せるうち（ログアウト前）に消し、消せなくても購読を解除すれば endpoint が失効してサーバーが片付ける。
 */
export async function detachWebPush(): Promise<void> {
  syncGeneration++
  setPush('unknown')
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await readyRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    const supabase = getSupabase()
    if (supabase) {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      if (error) {
        console.error('[push] delete on sign-out failed', error.message)
        reportFailure('push', 'detach:delete', error.message)
      }
    }
    await sub.unsubscribe()
  } catch (err) {
    console.error('[push] detach failed', err)
    reportFailure('push', 'detach', err)
  }
}
