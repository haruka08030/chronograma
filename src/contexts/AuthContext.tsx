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
  cacheProviderRefreshToken,
  disconnectGoogleCalendar,
  hasOAuthCallbackInUrl,
  isGoogleCalendarConnected,
  localizeGoogleError,
  tryPersistGoogleRefreshToken,
} from '../lib/googleCalendar'
import i18n from '../i18n/config'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { useTaskStore } from '../store/taskStore'

export type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  signInWithOtp: (email: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const noopAuth: AuthContextValue = {
  session: null,
  user: null,
  loading: false,
  signInWithOtp: async () => ({ error: 'Supabase が設定されていません' }),
  signOut: async () => {},
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

  if (fromOAuthCallback || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
    try {
      const stored = await tryPersistGoogleRefreshToken(session)
      if (stored) {
        const verified = await isGoogleCalendarConnected()
        useTaskStore.getState().setGoogleConnected(verified)
        if (verified) {
          useTaskStore.getState().setGoogleConnectionError(null)
        }
        return
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to store Google refresh token'
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return

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
      if (s?.provider_refresh_token) {
        cacheProviderRefreshToken(s.provider_refresh_token)
      }

      if (s && GOOGLE_AUTH_EVENTS.has(event)) {
        enqueueGoogleSync(() => handleGoogleAuthSideEffects(event, s))
      }

      if (event === 'SIGNED_OUT') {
        useTaskStore.getState().setGoogleConnected(false)
        useTaskStore.getState().setGoogleAccessToken(null)
        useTaskStore.getState().setCalendarEvents([])
        useTaskStore.getState().setGoogleConnectionError(null)
        void disconnectGoogleCalendar()
      }
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
        const { error } = await sb.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
        })
        return error ? { error: error.message } : {}
      },
      signOut: async () => {
        try {
          await disconnectGoogleCalendar()
        } catch {
          /* ignore */
        }
        useTaskStore.getState().setGoogleConnected(false)
        useTaskStore.getState().setGoogleAccessToken(null)
        useTaskStore.getState().setCalendarEvents([])
        useTaskStore.getState().setGoogleConnectionError(null)
        const sb = getSupabase()
        if (sb) await sb.auth.signOut()
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
