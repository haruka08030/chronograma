import { calendarColorHex, googleEventHex, hasOwnEventColor } from './googleColors'
import type { CalendarEvent } from '../types/calendarEvent'
import { getSupabase, isSupabaseConfigured } from './supabase'
import { isNetworkErrorMessage } from './errorMessages'
import { functionErrorMessage } from './functionError'
import { appTimeZone, fromAppWall, instantFromWall, wallInZone } from './timeZone'
import { fromDateKey } from './dateKey'
import { pad2 } from './clockTime'

type GoogleCalendarPayload = {
  ok?: boolean
  connected?: boolean
  events?: CalendarEvent[]
  error?: string
}

async function invokeGoogleCalendar<T extends GoogleCalendarPayload>(body: Record<string, unknown>): Promise<T> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')

  const { data, error } = await sb.functions.invoke('google-calendar', { body })

  // 関数は失敗を 4xx / 5xx で返す（本文は { ok: false, error }）。古い関数は 200 で { ok: false } を返す
  if (error) throw new Error(await functionErrorMessage(error))

  const payload = (data ?? {}) as T
  if (payload.error && payload.ok === false) {
    throw new Error(payload.error)
  }
  return payload
}

// 自分のカレンダーの予定の読み書き（events.owned）＋カレンダーの色の取得（calendarlist.readonly）。
// Edge Function `google-calendar` の SCOPES とそろえる
const SCOPES = 'https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendarlist.readonly'
const GCAL_OAUTH_STATE_KEY = 'chronograma_gcal_oauth_state'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

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

/** 読み取りだけでつないでいる人が、書き込みを許可し直す（同意画面を出し直す） */
export function requestGoogleWriteAccess(): void {
  startDirectGoogleOAuth()
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
  // OAuth の戻りの値だけ消す（画面の `?view=` などは残す）
  const cleanUrl = new URL(window.location.href)
  for (const key of ['code', 'state', 'scope', 'authuser', 'hd', 'prompt', 'error']) cleanUrl.searchParams.delete(key)
  window.history.replaceState(window.history.state, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash)
  return true
}

/** @deprecated Use Edge Function; kept for disconnect local cleanup */
export function signOut(): void {
  // no-op; server token cleared via disconnectGoogleCalendar
}

/**
 * Google の利用上限・送りすぎか（関数の `google_rate_limited` / 429 の文言）。
 * 待てば直るので、連携は外さない
 */
export function isGoogleRateLimitMessage(message: string): boolean {
  return /too many requests|rate.?limit|quota/i.test(message)
}

export function shouldDisconnectAfterFetchError(message: string): boolean {
  if (isGoogleRateLimitMessage(message)) return false
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

export function localizeGoogleError(message: string, t: (key: string, options?: Record<string, string>) => string): string {
  const lower = message.toLowerCase()
  if (isNetworkErrorMessage(message)) return t('planVsActual.networkError')
  if (lower.includes('supabase is not configured')) return t('planVsActual.supabaseNotConfigured')
  if (lower.includes('not connected')) return t('planVsActual.notConnected')
  if (isGoogleRateLimitMessage(message)) return t('planVsActual.rateLimited')
  if (lower.includes('authorization expired') || lower.includes('invalid_grant')) {
    return t('planVsActual.tokenExpired')
  }
  if (lower.includes('non-2xx')) return t('planVsActual.storeTokenFailed')
  if (lower.includes('refresh token missing')) return t('planVsActual.oauthRefreshMissing')
  if (lower.includes('write scope not granted')) return t('googleEdit.needWriteAccess')
  if (lower.includes('read-only for you')) return t('googleEdit.readOnlyEvent')
  if (lower.includes('scope not granted')) return t('planVsActual.scopeNotGranted')
  // ここから下はサーバーやアプリの設定の誤り。利用者には直せないので、開発中だけ詳しく出す
  console.error('[google]', message)
  if (!import.meta.env.DEV) return t('planVsActual.connectFailed')
  if (lower.includes('redirect_uri_mismatch')) {
    return t('planVsActual.redirectUriMismatch', { uri: getGoogleRedirectUri() })
  }
  if (lower.includes('invalid_client') || lower.includes('client secret is invalid')) {
    return t('planVsActual.invalidClientSecret')
  }
  return message
}

function formatYmdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Edge Function は UTC で HH:mm を算出するため、アプリのタイムゾーンで再正規化する */
export function normalizeCalendarEventTimes(event: CalendarEvent): CalendarEvent {
  if (event.isAllDay) return event

  const tz = appTimeZone()
  const start = wallInZone(new Date(event.start).getTime(), tz)
  const end = wallInZone(new Date(event.end).getTime(), tz)
  return {
    ...event,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
  }
}

/** 最後に取れたカレンダーの色（色の付いていない新しい予定に使う） */
let lastCalendarHex: string | null | undefined

function withColors(e: CalendarEvent): CalendarEvent {
  const baseColor = googleEventHex(e.colorId, lastCalendarHex)
  return { ...e, baseColor, ownColor: hasOwnEventColor(e.colorId), color: baseColor }
}

/**
 * 書き込み中・書き込み直後に始まった取得の結果で、楽観的に動かした予定を巻き戻さないための世代。
 * 取得は開始時の世代を覚え、結果が来たときに世代が変わっていたら捨てる（次の取得で正しくなる）
 */
let writeGeneration = 0
let writesInFlight = 0
export function googleWriteGeneration(): number {
  return writesInFlight > 0 ? -1 : writeGeneration
}

export async function fetchCalendarEvents(timeMin: Date, timeMax: Date): Promise<{ events: CalendarEvent[]; canWrite: boolean }> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')

  type EventsPayload = {
    events?: CalendarEvent[]
    calendarColor?: string | null
    calendarColorId?: string | null
    connected?: boolean
    canWrite?: boolean
    error?: string
  }
  let payload: EventsPayload
  try {
    payload = await invokeGoogleCalendar<EventsPayload>({
      action: 'events',
      // 範囲はアプリのタイムゾーンの壁時計で作られているので、本当の瞬間に戻す
      timeMin: fromAppWall(timeMin).toISOString(),
      timeMax: fromAppWall(timeMax).toISOString(),
      timeZone: appTimeZone(),
    })
    // 古い関数は失敗も 200 で { events: [], error } を返す
    if (payload.error) throw new Error(payload.error)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (shouldDisconnectAfterFetchError(message)) {
      try {
        await disconnectGoogleCalendar()
      } catch {
        /* ignore */
      }
    }
    throw e
  }
  // 自分で色を付けていない予定はカレンダーの色
  lastCalendarHex = calendarColorHex(payload.calendarColor, payload.calendarColorId)
  return {
    events: (payload.events ?? []).map(normalizeCalendarEventTimes).map(withColors),
    canWrite: payload.canWrite === true,
  }
}

/** アプリ内の日付・時刻（終日なら時刻 null）。`endDate` は最終日（含む）。省略時は日をまたぐなら翌日 */
export interface GoogleEventTiming {
  date: string
  endDate?: string | null
  startTime: string | null
  endTime: string | null
  /** 日付・時刻がどのタイムゾーンの壁時計か（予定のタイムゾーンとして Google に送る）。省略時はアプリのタイムゾーン */
  timeZone?: string | null
}

function addDaysYmd(ymd: string, days: number): string {
  const d = fromDateKey(ymd)
  d.setDate(d.getDate() + days)
  return formatYmdLocal(d)
}

type GoogleTimes =
  | { start: { date: string }; end: { date: string } }
  | { start: { dateTime: string; timeZone: string }; end: { dateTime: string; timeZone: string } }

function toGoogleTimes(t: GoogleEventTiming): GoogleTimes {
  if (!t.startTime || !t.endTime) {
    // Google の終日は終わりの日を含まない
    return { start: { date: t.date }, end: { date: addDaysYmd(t.endDate ?? t.date, 1) } }
  }
  const timeZone = t.timeZone || appTimeZone()
  const endDate = t.endDate ?? (t.endTime <= t.startTime ? addDaysYmd(t.date, 1) : t.date)
  return {
    start: { dateTime: `${t.date}T${t.startTime}:00`, timeZone },
    end: { dateTime: `${endDate}T${t.endTime}:00`, timeZone },
  }
}

/** 予定の今の日付・時刻（終日の複数日は最終日つき） */
export function googleEventTiming(e: CalendarEvent): GoogleEventTiming {
  if (e.isAllDay) {
    const last = addDaysYmd(e.end.slice(0, 10), -1)
    return { date: e.date, endDate: last > e.date ? last : null, startTime: null, endTime: null }
  }
  const end = wallInZone(new Date(e.end).getTime(), appTimeZone())
  return { date: e.date, endDate: end.date, startTime: e.startTime, endTime: e.endTime }
}

/** 楽観表示用に、Google から返る形をローカルで組み立てる */
export function applyTimingLocally(e: CalendarEvent, t: GoogleEventTiming): CalendarEvent {
  const g = toGoogleTimes(t)
  const isAllDay = !('dateTime' in g.start)
  const instant = (x: { dateTime: string; timeZone: string }) =>
    new Date(instantFromWall(x.dateTime.slice(0, 10), x.dateTime.slice(11, 16), x.timeZone)).toISOString()
  const start = 'dateTime' in g.start ? instant(g.start) : g.start.date
  const end = 'dateTime' in g.end ? instant(g.end) : g.end.date
  return normalizeCalendarEventTimes({
    ...e,
    isAllDay,
    date: t.date,
    startTime: isAllDay ? null : t.startTime,
    endTime: isAllDay ? null : t.endTime,
    start,
    end,
  })
}

async function writeGoogle(body: Record<string, unknown>): Promise<CalendarEvent | null> {
  writesInFlight++
  writeGeneration++
  try {
    const payload = await invokeGoogleCalendar<{ ok?: boolean; event?: CalendarEvent | null; error?: string }>({
      ...body,
      timeZone: appTimeZone(),
    })
    if (payload.ok === false) throw new Error(payload.error ?? 'Google Calendar write failed')
    return payload.event ? withColors(normalizeCalendarEventTimes(payload.event)) : null
  } finally {
    writesInFlight--
    writeGeneration++
  }
}

export async function createGoogleEvent(summary: string, timing: GoogleEventTiming): Promise<CalendarEvent | null> {
  return writeGoogle({ action: 'create', fields: { summary, ...toGoogleTimes(timing) } })
}

export async function updateGoogleEvent(
  eventId: string,
  change: { summary?: string; timing?: GoogleEventTiming },
): Promise<CalendarEvent | null> {
  const fields: Record<string, unknown> = {}
  if (change.summary !== undefined) fields.summary = change.summary
  if (change.timing) Object.assign(fields, toGoogleTimes(change.timing))
  return writeGoogle({ action: 'update', eventId, fields })
}

export async function deleteGoogleEvent(eventId: string): Promise<void> {
  await writeGoogle({ action: 'delete', eventId })
}
