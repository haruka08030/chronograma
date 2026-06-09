import type { CalendarEvent } from '../types/calendarEvent'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from './supabase'

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'

export function getClientId(): string | undefined {
  return isSupabaseConfigured ? 'supabase-oauth' : undefined
}

export function isGoogleAvailable(): boolean {
  return isSupabaseConfigured
}

export function initGoogleAuth(): Promise<void> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error('Supabase is not configured'))
  }
  return Promise.resolve()
}

export function signIn(): Promise<string> {
  const sb = getSupabase()
  if (!sb) return Promise.reject(new Error('Supabase is not configured'))

  const options = {
    redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    scopes: SCOPES,
    queryParams: {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    },
  }

  return sb.auth.getUser().then(async ({ data: { user } }) => {
    if (user) {
      const { error } = await sb.auth.linkIdentity({
        provider: 'google',
        options,
      })
      if (error) throw error
      return ''
    }
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options,
    })
    if (error) throw error
    return ''
  })
}

/** @deprecated Use Edge Function; kept for disconnect local cleanup */
export function signOut(): void {
  // no-op; server token cleared via disconnectGoogleCalendar
}

export async function storeGoogleRefreshToken(session: Session | null): Promise<void> {
  const sb = getSupabase()
  if (!sb || !session) return

  const refreshToken =
    session.provider_refresh_token ??
    (session as Session & { provider_refresh_token?: string }).provider_refresh_token

  if (!refreshToken) return

  const { error } = await sb.functions.invoke('google-calendar', {
    body: { action: 'store', refresh_token: refreshToken, scope: SCOPES },
  })

  if (error) throw error
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  const { error } = await sb.functions.invoke('google-calendar', {
    body: { action: 'disconnect' },
  })
  if (error) throw error
}

export async function isGoogleCalendarConnected(): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false

  const { data, error } = await sb.functions.invoke('google-calendar', {
    body: { action: 'status' },
  })

  if (error) return false
  const payload = data as { connected?: boolean } | null
  return payload?.connected === true
}

export async function fetchCalendarEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')

  const { data, error } = await sb.functions.invoke('google-calendar', {
    body: {
      action: 'events',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
    },
  })

  if (error) throw error

  const payload = data as { events?: CalendarEvent[]; error?: string } | null
  if (payload?.error) throw new Error(payload.error)
  return payload?.events ?? []
}
