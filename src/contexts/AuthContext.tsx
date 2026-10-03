import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import {
  handleGoogleOAuthCallback,
  hasGoogleOAuthCallbackInUrl,
  hasOAuthCallbackInUrl,
  isGoogleCalendarConnected,
  localizeGoogleError,
} from '../lib/googleCalendar'
import i18n from '../i18n/config'
import { isNetworkErrorMessage, otpRateLimit } from '../lib/errorMessages'
import { pendingAuthLinkError } from '../lib/authLinkError'
import { getSupabase, isSupabaseConfigured, signOutThisDevice } from '../lib/supabase'
import { useTaskStore } from '../store/taskStore'
import { backupNow } from '../hooks/useAutoBackup'
import { clearAutoBackups } from '../lib/autoBackup'
import { clearBaseline } from '../lib/syncMerge'
import { detachWebPush } from '../lib/webPush'
import { FunctionsHttpError } from '@supabase/supabase-js'

export type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  signInWithOtp: (email: string) => Promise<{ error?: string }>
  verifyEmailOtp: (email: string, token: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  /** アカウントとクラウドのデータを全部消し、この端末のデータと自動バックアップも消す */
  deleteAccount: () => Promise<{ error?: string }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const noopAuth: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  signInWithOtp: async () => ({ error: 'Supabase が設定されていません' }),
  verifyEmailOtp: async () => ({ error: 'Supabase が設定されていません' }),
  signOut: async () => {},
  deleteAccount: async () => ({ error: 'Supabase が設定されていません' }),
}

const GOOGLE_AUTH_EVENTS = new Set<AuthChangeEvent>([
  'SIGNED_IN',
  'USER_UPDATED',
  'TOKEN_REFRESHED',
  'INITIAL_SESSION',
])

const STATUS_SYNC_EVENTS = new Set<AuthChangeEvent>([
  'INITIAL_SESSION',
  'SIGNED_IN',
  'USER_UPDATED',
])

function hasGoogleIdentity(user: User): boolean {
  return user.identities?.some((identity) => identity.provider === 'google') ?? false
}

let googleSyncQueue: Promise<void> = Promise.resolve()

function enqueueGoogleSync(task: () => Promise<void>) {
  googleSyncQueue = googleSyncQueue.then(task).catch((err) => {
    console.error('Google sync task failed:', err)
  })
}

async function handleGoogleAuthSideEffects(event: AuthChangeEvent, session: Session) {
  const user = session.user
  const fromOAuthCallback = hasOAuthCallbackInUrl()

  // 直接 Google OAuth の ?code= は、どの画面に戻ってきても必ず交換する。
  // （以前は plan-vs-actual が mount されたときだけ処理していたため取りこぼしていた）
  if (hasGoogleOAuthCallbackInUrl()) {
    try {
      const handled = await handleGoogleOAuthCallback()
      if (handled) {
        const connected = await isGoogleCalendarConnected()
        useTaskStore.getState().setGoogleConnected(connected)
        useTaskStore.getState().setGoogleConnectionError(
          connected ? null : useTaskStore.getState().googleConnectionError,
        )
        if (connected) return
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Google OAuth callback failed'
      useTaskStore.getState().setGoogleConnected(false)
      useTaskStore.getState().setGoogleConnectionError(
        localizeGoogleError(raw, (key) => i18n.t(key)),
      )
      return
    }
  }

  // TOKEN_REFRESHED では接続状態を下げない（store 完了前の status が false になりやすい）
  if (!STATUS_SYNC_EVENTS.has(event)) {
    return
  }

  if (user && hasGoogleIdentity(user)) {
    try {
      const connected = await isGoogleCalendarConnected()
      useTaskStore.getState().setGoogleConnected(connected)
      if (connected) {
        useTaskStore.getState().setGoogleConnectionError(null)
      } else if (fromOAuthCallback) {
        useTaskStore.getState().setGoogleConnectionError(
          localizeGoogleError(
            'Google refresh token missing after OAuth. Reconnect after revoking app access.',
            (key) => i18n.t(key),
          ),
        )
      }
    } catch {
      useTaskStore.getState().setGoogleConnected(false)
    }
    return
  }

  try {
    const connected = await isGoogleCalendarConnected()
    useTaskStore.getState().setGoogleConnected(connected)
    if (connected) {
      useTaskStore.getState().setGoogleConnectionError(null)
    }
  } catch {
    useTaskStore.getState().setGoogleConnected(false)
  }
}

/**
 * ログアウト後の端末から、そのアカウントのデータを消す。消さないと次にログインした人に見え、
 * その人のアカウントにも送られていた。送れていなかった変更が消えないよう、先に端末内に控えを取る。
 * Google の連携はサーバー側のアカウントに付いているので切らない（以前はここで切っていて、
 * 1 台でログアウトすると全端末の連携が外れた）
 */
function clearLocalAccountState() {
  const store = useTaskStore.getState()
  store.setGoogleConnected(false)
  store.setGoogleAccessToken(null)
  store.setCalendarEvents([])
  store.setGoogleConnectionError(null)
  // 他のタブでのログアウトなど、ここに来た時点で行を消せなくても購読は解除する
  void detachWebPush()
  // 一度も同期できていない（dataOwner が null の）データも、ログインしていた人のものなので消す。控えは残る
  if (store.dataOwner === null && store.tasks.length === 0 && store.habits.length === 0) return
  backupNow('beforeSignOut')
  store.resetLocalData()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return

    // ログイン用リンクが使えなかった（期限切れ・使用済み）。理由はアカウント欄に出す
    if (pendingAuthLinkError()) useTaskStore.getState().openSettingsWithScroll('account')

    const sb = getSupabase()
    if (!sb) return

    sb.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s)
        if (s) {
          enqueueGoogleSync(() => handleGoogleAuthSideEffects('INITIAL_SESSION', s))
        }
      })
      .catch((err) => {
        console.error('Failed to get session:', err)
      })
      .finally(() => {
        setLoading(false)
      })

    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s)

      if (s && GOOGLE_AUTH_EVENTS.has(event)) {
        enqueueGoogleSync(() => handleGoogleAuthSideEffects(event, s))
      }

      if (event === 'SIGNED_OUT') clearLocalAccountState()
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signInWithOtp: async (email: string) => {
        const sb = getSupabase()
        if (!sb) return { error: 'Supabase が設定されていません' }
        try {
          const { error } = await sb.auth.signInWithOtp({
            email: email.trim(),
            options: {
              emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
            },
          })
          if (!error) return {}
          if (isNetworkErrorMessage(error.message)) return { error: i18n.t('account.networkError') }
          // 送りすぎは英語のまま出さず、待てば送れることを伝える
          const limit = otpRateLimit(error)
          if (limit) {
            return {
              error: limit.seconds != null
                ? i18n.t('account.otpWaitSeconds', { count: limit.seconds })
                : i18n.t('account.otpRateLimited'),
            }
          }
          return { error: error.message }
        } catch (err) {
          const message = err instanceof Error ? err.message : ''
          if (isNetworkErrorMessage(message)) return { error: i18n.t('account.networkError') }
          return { error: message || i18n.t('account.genericError') }
        }
      },
      // ホーム画面に追加した PWA ではメールのリンクが Safari 側で開き、
      // セッションが PWA に渡らない。メール内のコードをアプリ内で入力して検証する。
      verifyEmailOtp: async (email: string, token: string) => {
        const sb = getSupabase()
        if (!sb) return { error: 'Supabase が設定されていません' }
        try {
          const { error } = await sb.auth.verifyOtp({
            email: email.trim(),
            token: token.trim(),
            type: 'email',
          })
          if (!error) return {}
          if (isNetworkErrorMessage(error.message)) return { error: i18n.t('account.networkError') }
          return { error: i18n.t('account.invalidCode') }
        } catch (err) {
          const message = err instanceof Error ? err.message : ''
          if (isNetworkErrorMessage(message)) return { error: i18n.t('account.networkError') }
          return { error: message || i18n.t('account.genericError') }
        }
      },
      signOut: async () => {
        const sb = getSupabase()
        // 通知の行は RLS 上ログイン中にしか消せないので、セッションを切る前に外す
        await detachWebPush()
        // この端末のセッションだけを切る。既定（global）だとほかの端末もログアウトされ、
        // そちらの Google 連携まで外れたように見えていた。オフラインでも端末からは確実に消す
        if (sb) await signOutThisDevice(sb)
        setSession(null)
        // 他のタブや期限切れでも SIGNED_OUT で同じ処理が走る。ここでも呼んで確実に消す（2 回目は何もしない）
        clearLocalAccountState()
      },
      deleteAccount: async () => {
        const sb = getSupabase()
        const userId = session?.user.id
        if (!sb || !userId) return { error: i18n.t('account.genericError') }
        try {
          const { data, error } = await sb.functions.invoke('account', { body: { action: 'delete' } })
          if (error || (data as { ok?: boolean } | null)?.ok !== true) {
            const message = error instanceof FunctionsHttpError
              ? ((await error.context.json().catch(() => null)) as { error?: string } | null)?.error
              : error?.message
            if (message && isNetworkErrorMessage(message)) return { error: i18n.t('account.networkError') }
            return { error: i18n.t('account.deleteFailed') }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : ''
          return { error: i18n.t(isNetworkErrorMessage(message) ? 'account.networkError' : 'account.deleteFailed') }
        }
        // 消したデータの控えは残さない（clearLocalAccountState より先に空にする）
        useTaskStore.getState().resetLocalData()
        clearBaseline(userId)
        await clearAutoBackups()
        // ユーザーはもう無いので、サーバーに問い合わせずこの端末のセッションだけ消す
        await signOutThisDevice(sb)
        setSession(null)
        clearLocalAccountState()
        return {}
      },
    }),
    [session, loading],
  )

  if (!isSupabaseConfigured) {
    return <>{children}</>
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Fast refresh: hook is intentionally co-located with provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  return ctx ?? noopAuth
}
