import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  disconnectGoogleCalendar,
  isGoogleCalendarConnected,
  storeGoogleRefreshToken,
} from '../lib/googleCalendar'
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return

    const sb = getSupabase()
    if (!sb) return

    const syncGoogleConnection = async (hasSession: boolean) => {
      if (!hasSession) return
      try {
        const connected = await isGoogleCalendarConnected()
        useTaskStore.getState().setGoogleConnected(connected)
      } catch {
        useTaskStore.getState().setGoogleConnected(false)
      }
    }

    sb.auth.getSession()
      .then(async ({ data: { session: s } }) => {
        setSession(s)
        await syncGoogleConnection(!!s)
      })
      .catch((err) => {
        console.error('Failed to get session:', err)
      })
      .finally(() => {
        setLoading(false)
      })

    const { data: sub } = sb.auth.onAuthStateChange(async (event, s) => {
      setSession(s)
      if (
        s &&
        (event === 'SIGNED_IN' ||
          event === 'USER_UPDATED' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'INITIAL_SESSION')
      ) {
        const refresh = s.provider_refresh_token
        if (refresh) {
          try {
            await storeGoogleRefreshToken(s)
            useTaskStore.getState().setGoogleConnected(true)
          } catch (err) {
            console.error('Failed to store Google refresh token:', err)
          }
        } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          await syncGoogleConnection(true)
        }
      }
      if (event === 'SIGNED_OUT') {
        useTaskStore.getState().setGoogleConnected(false)
        useTaskStore.getState().setGoogleAccessToken(null)
        useTaskStore.getState().setCalendarEvents([])
        try {
          await disconnectGoogleCalendar()
        } catch {
          /* session already gone */
        }
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
