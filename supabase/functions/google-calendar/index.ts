import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

// 予定の読み書き（events）＋カレンダーの色の取得（readonly）
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events'
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type CalendarEvent = {
  id: string
  summary: string
  description?: string
  start: string
  end: string
  startTime: string | null
  endTime: string | null
  date: string
  isAllDay: boolean
  colorId?: string
  recurringEventId?: string
  /** 自分が主催者、またはゲストに変更が許されている（= このアプリから動かせる） */
  editable: boolean
  htmlLink?: string
}

type GoogleEventItem = {
  id: string
  summary?: string
  description?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  colorId?: string
  recurringEventId?: string
  htmlLink?: string
  organizer?: { self?: boolean }
  guestsCanModify?: boolean
  locked?: boolean
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function intlPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '00'
}

function formatYmdInTz(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso))
  return `${intlPart(parts, 'year')}-${intlPart(parts, 'month')}-${intlPart(parts, 'day')}`
}

function formatHmInTz(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  return `${intlPart(parts, 'hour')}:${intlPart(parts, 'minute')}`
}

function normalizeEvents(items: GoogleEventItem[], timeZone: string): CalendarEvent[] {
  return items.map((item) => {
    const isAllDay = !item.start.dateTime
    const startDt = item.start.dateTime ?? item.start.date!
    const endDt = item.end.dateTime ?? item.end.date!

    let date: string
    let startTime: string | null = null
    let endTime: string | null = null

    if (isAllDay) {
      date = startDt
    } else {
      date = formatYmdInTz(startDt, timeZone)
      startTime = formatHmInTz(startDt, timeZone)
      endTime = formatHmInTz(endDt, timeZone)
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
      recurringEventId: item.recurringEventId,
      // 主催者でなくても guestsCanModify なら動かせる。organizer が無い（自分だけの予定）も自分のもの
      editable: !item.locked && (item.organizer?.self !== false || item.guestsCanModify === true),
      htmlLink: item.htmlLink,
    }
  })
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth secrets are not configured on the server')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google token refresh failed: ${res.status} ${body}`)
  }

  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) {
    throw new Error('Google token refresh returned no access_token')
  }
  return data.access_token
}

async function fetchGoogleEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
  timeZone: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Calendar API error ${res.status}: ${body}`)
  }

  const data = (await res.json()) as { items?: GoogleEventItem[] }

  return normalizeEvents(data.items ?? [], timeZone)
}

type EventTime = { date?: string; dateTime?: string; timeZone?: string }

/** 書き込みで受け付ける項目だけを取り出す（任意のフィールドを Google に流さない） */
function pickEventFields(raw: unknown): Record<string, unknown> {
  const src = (raw ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if (typeof src.summary === 'string') out.summary = src.summary
  if (typeof src.description === 'string') out.description = src.description
  for (const key of ['start', 'end'] as const) {
    const v = src[key] as EventTime | undefined
    if (!v) continue
    // 終日 ⇄ 時刻つきを切り替えるとき、もう片方は明示的に消す必要がある
    if (typeof v.date === 'string') out[key] = { date: v.date, dateTime: null }
    else if (typeof v.dateTime === 'string') out[key] = { dateTime: v.dateTime, timeZone: v.timeZone, date: null }
  }
  return out
}

async function writeGoogleEvent(
  accessToken: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  eventId: string | null,
  fields: Record<string, unknown> | null,
): Promise<GoogleEventItem | null> {
  const path = eventId
    ? `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}`
    : `${CALENDAR_API}/calendars/primary/events`
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: fields ? JSON.stringify(fields) : undefined,
  })
  // 既に消えている予定の削除は成功扱い
  if (method === 'DELETE' && (res.status === 404 || res.status === 410)) return null
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Calendar API error ${res.status}: ${body}`)
  }
  if (method === 'DELETE') return null
  return (await res.json()) as GoogleEventItem
}

function hasWriteScope(scope: string | null | undefined): boolean {
  return (scope ?? '').split(/\s+/).includes(WRITE_SCOPE)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Server misconfigured' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const body = req.method === 'POST' ? await req.json() : {}
    const action = (body.action as string) ?? ''

    if (action === 'exchange') {
      const code = body.code as string | undefined
      const redirectUri = body.redirect_uri as string | undefined
      if (!code?.trim() || !redirectUri?.trim()) {
        return jsonResponse({ ok: false, error: 'code and redirect_uri are required' })
      }

      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
      if (!clientId || !clientSecret) {
        return jsonResponse({ ok: false, error: 'Google OAuth secrets are not configured on the server' })
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code.trim(),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri.trim(),
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenRes.ok) {
        const bodyText = await tokenRes.text()
        return jsonResponse({
          ok: false,
          error: `Google code exchange failed: ${tokenRes.status} ${bodyText}`,
        })
      }

      const tokenData = (await tokenRes.json()) as {
        refresh_token?: string
        access_token?: string
        scope?: string
      }

      const refreshToken = tokenData.refresh_token
      if (!refreshToken) {
        return jsonResponse({
          ok: false,
          error: 'Google did not return a refresh token. Revoke app access in your Google account, then reconnect.',
        })
      }

      const { error } = await admin.from('google_oauth').upsert(
        {
          user_id: user.id,
          refresh_token: refreshToken,
          // ユーザーが同意画面で書き込みを外すこともあるので、実際に許可された範囲を保存する
          scope: tokenData.scope ?? (body.scope as string) ?? SCOPES,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

      if (error) {
        return jsonResponse({ ok: false, error: error.message })
      }
      return jsonResponse({ ok: true })
    }

    if (action === 'disconnect') {
      const { error } = await admin
        .from('google_oauth')
        .delete()
        .eq('user_id', user.id)

      if (error) {
        return jsonResponse({ error: error.message }, 500)
      }
      return jsonResponse({ ok: true })
    }

    if (action === 'status') {
      const { data: row, error: fetchError } = await admin
        .from('google_oauth')
        .select('refresh_token')
        .eq('user_id', user.id)
        .maybeSingle()

      if (fetchError) {
        return jsonResponse({ error: fetchError.message }, 500)
      }
      if (!row?.refresh_token) {
        return jsonResponse({ connected: false })
      }

      try {
        await refreshGoogleAccessToken(row.refresh_token)
        return jsonResponse({ connected: true })
      } catch {
        await admin.from('google_oauth').delete().eq('user_id', user.id)
        return jsonResponse({ connected: false, stale: true })
      }
    }

    if (action === 'events') {
      const timeMin = body.timeMin as string | undefined
      const timeMax = body.timeMax as string | undefined
      if (!timeMin || !timeMax) {
        return jsonResponse({ events: [], error: 'timeMin and timeMax are required' })
      }

      const { data: row, error: fetchError } = await admin
        .from('google_oauth')
        .select('refresh_token, scope')
        .eq('user_id', user.id)
        .maybeSingle()

      if (fetchError) {
        return jsonResponse({ error: fetchError.message }, 500)
      }
      if (!row?.refresh_token) {
        return jsonResponse({
          events: [],
          connected: false,
          error: 'Google Calendar not connected. Reconnect in settings.',
        })
      }

      try {
        const timeZone = (body.timeZone as string | undefined)?.trim() || 'UTC'
        const accessToken = await refreshGoogleAccessToken(row.refresh_token)
        const events = await fetchGoogleEvents(accessToken, timeMin, timeMax, timeZone)
        // 予定に個別の色が無いときはカレンダー自体の色になるので、それも返す（取れなくても予定は返す）
        // colorId（1〜24）の方が確実に色を特定できるので両方返す
        let calendarColor: string | null = null
        let calendarColorId: string | null = null
        try {
          const res = await fetch(`${CALENDAR_API}/users/me/calendarList/primary`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (res.ok) {
            const entry = (await res.json()) as { backgroundColor?: string; colorId?: string }
            calendarColor = entry.backgroundColor ?? null
            calendarColorId = entry.colorId ?? null
          }
        } catch {
          /* ignore */
        }
        return jsonResponse({ events, calendarColor, calendarColorId, connected: true, canWrite: hasWriteScope(row.scope) })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        const needsReconnect =
          message.includes('invalid_grant') ||
          message.includes('token refresh failed') ||
          message.includes('Calendar API error 401') ||
          message.includes('Calendar API error 403')
        const scopeMissing = message.includes('Calendar API error 403')
        return jsonResponse({
          events: [],
          connected: false,
          error: scopeMissing
            ? 'Google Calendar scope not granted. Reconnect and approve calendar access.'
            : needsReconnect
              ? 'Google Calendar authorization expired. Disconnect and reconnect.'
              : message,
        })
      }
    }

    if (action === 'create' || action === 'update' || action === 'delete') {
      const { data: row, error: fetchError } = await admin
        .from('google_oauth')
        .select('refresh_token, scope')
        .eq('user_id', user.id)
        .maybeSingle()
      if (fetchError) return jsonResponse({ ok: false, error: fetchError.message }, 500)
      if (!row?.refresh_token) {
        return jsonResponse({ ok: false, error: 'Google Calendar not connected. Reconnect in settings.' })
      }
      if (!hasWriteScope(row.scope)) {
        return jsonResponse({ ok: false, error: 'Google Calendar write scope not granted. Reconnect and approve calendar access.' })
      }
      const eventId = (body.eventId as string | undefined)?.trim() || null
      if (action !== 'create' && !eventId) return jsonResponse({ ok: false, error: 'eventId is required' })
      try {
        const timeZone = (body.timeZone as string | undefined)?.trim() || 'UTC'
        const accessToken = await refreshGoogleAccessToken(row.refresh_token)
        const fields = action === 'delete' ? null : pickEventFields(body.fields)
        const item = await writeGoogleEvent(
          accessToken,
          action === 'create' ? 'POST' : action === 'update' ? 'PATCH' : 'DELETE',
          action === 'create' ? null : eventId,
          fields,
        )
        return jsonResponse({ ok: true, event: item ? normalizeEvents([item], timeZone)[0] : null })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        if (message.includes('Calendar API error 403')) {
          // 権限（scope）不足と、他人の予定で変更できないのを分ける
          const scopeIssue = /insufficient|scope/i.test(message)
          return jsonResponse({
            ok: false,
            error: scopeIssue
              ? 'Google Calendar write scope not granted. Reconnect and approve calendar access.'
              : 'Google Calendar event is read-only for you.',
          })
        }
        if (message.includes('invalid_grant') || message.includes('Calendar API error 401')) {
          return jsonResponse({ ok: false, error: 'Google Calendar authorization expired. Disconnect and reconnect.' })
        }
        return jsonResponse({ ok: false, error: message })
      }
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return jsonResponse({ ok: false, error: message })
  }
})
