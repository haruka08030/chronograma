import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

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

    sb.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s)
      })
      .catch((err) => {
        console.error('Failed to get session:', err)
      })
      .finally(() => {
        setLoading(false)
      })

    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s)
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
