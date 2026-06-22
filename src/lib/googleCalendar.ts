import type { CalendarEvent } from '../types/calendarEvent'
import type { Session } from '@supabase/supabase-js'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from './supabase'
import { isNetworkErrorMessage } from './errorMessages'

type GoogleCalendarPayload = {
  ok?: boolean
  connected?: boolean
  events?: CalendarEvent[]
  error?: string
}

async function parseFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      /* ignore parse failure */
    }
  }
  if (error instanceof Error) return error.message
  return 'Edge Function request failed'
}

async function invokeGoogleCalendar<T extends GoogleCalendarPayload>(
  body: Record<string, unknown>,
): Promise<T> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')

  const { data, error } = await sb.functions.invoke('google-calendar', { body })

  if (error) {
    const msg = await parseFunctionError(error)
    throw new Error(msg)
  }

  const payload = (data ?? {}) as T
  if (payload.error && payload.ok === false) {
    throw new Error(payload.error)
  }
  return payload
}

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'
const GCAL_REFRESH_KEY = 'chronograma_gcal_provider_refresh'
const GCAL_OAUTH_STATE_KEY = 'chronograma_gcal_oauth_state'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

function parseProviderRefreshTokenFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return undefined
  return new URLSearchParams(hash).get('provider_refresh_token') ?? undefined
}

export function cacheProviderRefreshToken(token: string | null | undefined): void {
  if (typeof window === 'undefined' || !token) return
  sessionStorage.setItem(GCAL_REFRESH_KEY, token)
}

function readCachedProviderRefreshToken(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return sessionStorage.getItem(GCAL_REFRESH_KEY) ?? undefined
}

function clearCachedProviderRefreshToken(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(GCAL_REFRESH_KEY)
}

export function getClientId(): string | undefined {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
}

export function isGoogleAvailable(): boolean {
  return isSupabaseConfigured && Boolean(getClientId())
}

export function getGoogleRedirectUri(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

export function initGoogleAuth(): Promise<void> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error('Supabase is not configured'))
  }
  return Promise.resolve()
}

function startDirectGoogleOAuth(): void {
  const clientId = getClientId()
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not configured')
  }

  const state = crypto.randomUUID()
  sessionStorage.setItem(GCAL_OAUTH_STATE_KEY, state)

  const redirectUri = getGoogleRedirectUri()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })

  window.location.assign(`${GOOGLE_AUTH_URL}?${params}`)
}

export async function signIn(): Promise<string> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')
  if (!getClientId()) throw new Error('VITE_GOOGLE_CLIENT_ID is not configured')

  const connected = await isGoogleCalendarConnected()
  if (connected) return ''

  startDirectGoogleOAuth()
  return ''
}

export function hasGoogleOAuthCallbackInUrl(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.has('code') && params.has('state')
}

export async function handleGoogleOAuthCallback(): Promise<boolean> {
  if (typeof window === 'undefined' || !hasGoogleOAuthCallbackInUrl()) return false

  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const savedState = sessionStorage.getItem(GCAL_OAUTH_STATE_KEY)
  const oauthError = params.get('error')

  if (oauthError) {
    sessionStorage.removeItem(GCAL_OAUTH_STATE_KEY)
    throw new Error(oauthError)
  }
  if (!code || !state || state !== savedState) return false

  const redirectUri = getGoogleRedirectUri()
  const payload = await invokeGoogleCalendar<{ ok?: boolean; error?: string }>({
    action: 'exchange',
    code,
    redirect_uri: redirectUri,
    scope: SCOPES,
  })

  if (payload.ok === false) {
    throw new Error(payload.error ?? 'Failed to exchange Google authorization code')
  }

  sessionStorage.removeItem(GCAL_OAUTH_STATE_KEY)
  const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`
  window.history.replaceState({}, '', cleanUrl)
  return true
}

/** @deprecated Use Edge Function; kept for disconnect local cleanup */
export function signOut(): void {
  // no-op; server token cleared via disconnectGoogleCalendar
}

function getProviderRefreshToken(session: Session | null): string | undefined {
  const fromUrl = parseProviderRefreshTokenFromUrl()
  if (fromUrl) {
    cacheProviderRefreshToken(fromUrl)
    return fromUrl
  }
  const cached = readCachedProviderRefreshToken()
  if (cached) return cached
  if (!session) return undefined
  const fromSession =
    session.provider_refresh_token ??
    (session as Session & { provider_refresh_token?: string }).provider_refresh_token
  if (fromSession) cacheProviderRefreshToken(fromSession)
  return fromSession ?? undefined
}

export async function storeGoogleRefreshToken(session: Session | null): Promise<void> {
  const sb = getSupabase()
  if (!sb || !session) return

  const refreshToken = getProviderRefreshToken(session)
  if (!refreshToken) return

  const payload = await invokeGoogleCalendar<{ ok?: boolean; error?: string }>({
    action: 'store',
    refresh_token: refreshToken,
    scope: SCOPES,
  })

  if (payload.ok === false) {
    throw new Error(payload.error ?? 'Failed to store Google refresh token')
  }
  clearCachedProviderRefreshToken()
}

/** OAuth 直後は provider_refresh_token が遅れて載ることがあるためリトライする */
export async function tryPersistGoogleRefreshToken(
  initialSession: Session | null,
): Promise<boolean> {
  const sb = getSupabase()
  if (!sb || !initialSession) return false

  let session = initialSession
  for (const delayMs of [0, 400, 1200, 2500]) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const { data: { session: fresh } } = await sb.auth.getSession()
      if (fresh) session = fresh
    }

    const refreshToken = getProviderRefreshToken(session)
    if (!refreshToken) continue

    await storeGoogleRefreshToken(session)
    return true
  }

  return false
}

export function shouldDisconnectAfterFetchError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('not connected') ||
    lower.includes('reconnect') ||
    lower.includes('authorization expired') ||
    lower.includes('invalid_grant')
  )
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  clearCachedProviderRefreshToken()
  await invokeGoogleCalendar({ action: 'disconnect' })
}

export async function isGoogleCalendarConnected(): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false

  try {
    const payload = await invokeGoogleCalendar<{ connected?: boolean }>({
      action: 'status',
    })
    return payload.connected === true
  } catch {
    return false
  }
}

export function localizeGoogleError(
  message: string,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  const lower = message.toLowerCase()
  if (isNetworkErrorMessage(message)) return t('planVsActual.networkError')
  if (lower.includes('supabase is not configured')) return t('planVsActual.supabaseNotConfigured')
  if (lower.includes('not connected')) return t('planVsActual.notConnected')
  if (lower.includes('authorization expired') || lower.includes('invalid_grant')) {
    return t('planVsActual.tokenExpired')
  }
  if (lower.includes('non-2xx')) return t('planVsActual.storeTokenFailed')
  if (lower.includes('refresh token missing')) return t('planVsActual.oauthRefreshMissing')
  if (lower.includes('scope not granted')) return t('planVsActual.scopeNotGranted')
  if (lower.includes('redirect_uri_mismatch')) {
    return t('planVsActual.redirectUriMismatch', { uri: getGoogleRedirectUri() })
  }
  if (lower.includes('invalid_client') || lower.includes('client secret is invalid')) {
    return t('planVsActual.invalidClientSecret')
  }
  return message
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatYmdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatHmLocal(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Edge Function は UTC で HH:mm を算出するため、ブラウザのローカル TZ で再正規化する */
export function normalizeCalendarEventTimes(event: CalendarEvent): CalendarEvent {
  if (event.isAllDay) return event

  const start = new Date(event.start)
  const end = new Date(event.end)
  return {
    ...event,
    date: formatYmdLocal(start),
    startTime: formatHmLocal(start),
    endTime: formatHmLocal(end),
  }
}

function getClientTimeZone(): string {
  if (typeof Intl === 'undefined') return 'UTC'
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function hasOAuthCallbackInUrl(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash
  const search = window.location.search
  return (
    hash.includes('access_token') ||
    hash.includes('error') ||
    search.includes('code=') ||
    search.includes('error=')
  )
}

export async function fetchCalendarEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')

  const payload = await invokeGoogleCalendar<{
    events?: CalendarEvent[]
    connected?: boolean
    error?: string
  }>({
    action: 'events',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    timeZone: getClientTimeZone(),
  })

  if (payload.error) {
    if (shouldDisconnectAfterFetchError(payload.error)) {
      try {
        await disconnectGoogleCalendar()
      } catch {
        /* ignore */
      }
    }
    throw new Error(payload.error)
  }
  return (payload.events ?? []).map(normalizeCalendarEventTimes)
}
