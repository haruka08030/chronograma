import type { CalendarEvent } from '../types/calendarEvent'
import { format } from 'date-fns'
import { getSupabase, isSupabaseConfigured } from './supabase'

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
let currentToken: string | null = null

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

export function signInSilent(): Promise<string> {
  const sb = getSupabase()
  if (!sb) return Promise.reject(new Error('Supabase is not configured'))
  return sb.auth.getSession().then(({ data: { session } }) => {
    const token = session?.provider_token ?? null
    if (!token) {
      throw new Error('Google provider token is missing. Reconnect Google Calendar.')
    }
    currentToken = token
    return token
  })
}

export function signOut(): void {
  currentToken = null
}

export function getAccessToken(): string | null {
  return currentToken
}

export async function fetchCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  accessToken?: string,
): Promise<CalendarEvent[]> {
  const token = accessToken ?? currentToken
  if (!token) throw new Error('Not authenticated')

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Calendar API error ${res.status}: ${body}`)
  }

  const data = await res.json() as {
    items?: Array<{
      id: string
      summary?: string
      description?: string
      start: { dateTime?: string; date?: string }
      end: { dateTime?: string; date?: string }
      colorId?: string
    }>
  }

  return (data.items ?? []).map((item): CalendarEvent => {
    const isAllDay = !item.start.dateTime
    const startDt = item.start.dateTime ?? item.start.date!
    const endDt = item.end.dateTime ?? item.end.date!

    let date: string
    let startTime: string | null = null
    let endTime: string | null = null

    if (isAllDay) {
      date = startDt
    } else {
      const s = new Date(startDt)
      const e = new Date(endDt)
      date = format(s, 'yyyy-MM-dd')
      startTime = format(s, 'HH:mm')
      endTime = format(e, 'HH:mm')
    }

    return {
      id: item.id,
      summary: item.summary ?? '(無題)',
      description: item.description,
      start: startDt,
      end: endDt,
      startTime,
      endTime,
      date,
      isAllDay,
      colorId: item.colorId,
    }
  })
}
