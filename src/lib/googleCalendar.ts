import type { CalendarEvent } from '../types/calendarEvent'
import { format } from 'date-fns'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void
  callback: (resp: TokenResponse) => void
}

interface TokenResponse {
  access_token: string
  error?: string
}

let tokenClient: TokenClient | null = null
let currentToken: string | null = null
let resolveSignIn: ((token: string) => void) | null = null
let rejectSignIn: ((err: Error) => void) | null = null

export function getClientId(): string | undefined {
  return CLIENT_ID
}

export function isGoogleAvailable(): boolean {
  return !!(CLIENT_ID && typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).google)
}

export function initGoogleAuth(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error('VITE_GOOGLE_CLIENT_ID is not set'))
      return
    }

    const tryInit = () => {
      const g = (window as unknown as Record<string, unknown>).google as
        | { accounts: { oauth2: { initTokenClient: (cfg: Record<string, unknown>) => TokenClient } } }
        | undefined

      if (!g?.accounts?.oauth2) {
        reject(new Error('Google Identity Services not loaded'))
        return
      }

      tokenClient = g.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp: TokenResponse) => {
          if (resp.error) {
            rejectSignIn?.(new Error(resp.error))
          } else {
            currentToken = resp.access_token
            resolveSignIn?.(resp.access_token)
          }
          resolveSignIn = null
          rejectSignIn = null
        },
      })
      resolve()
    }

    if ((window as unknown as Record<string, unknown>).google) {
      tryInit()
    } else {
      const checkInterval = setInterval(() => {
        if ((window as unknown as Record<string, unknown>).google) {
          clearInterval(checkInterval)
          tryInit()
        }
      }, 200)
      setTimeout(() => {
        clearInterval(checkInterval)
        reject(new Error('Google Identity Services load timeout'))
      }, 10_000)
    }
  })
}

export function signIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Google Auth not initialized'))
      return
    }
    resolveSignIn = resolve
    rejectSignIn = reject
    tokenClient.requestAccessToken({ prompt: 'consent' })
  })
}

export function signInSilent(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Google Auth not initialized'))
      return
    }
    resolveSignIn = resolve
    rejectSignIn = reject
    tokenClient.requestAccessToken({ prompt: '' })
  })
}

export function signOut(): void {
  if (currentToken) {
    const g = (window as unknown as Record<string, unknown>).google as
      | { accounts: { oauth2: { revoke: (token: string, cb: () => void) => void } } }
      | undefined
    g?.accounts?.oauth2?.revoke(currentToken, () => {})
  }
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
