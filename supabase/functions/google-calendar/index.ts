import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'
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
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
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

function normalizeEvents(
  items: Array<{
    id: string
    summary?: string
    description?: string
    start: { dateTime?: string; date?: string }
    end: { dateTime?: string; date?: string }
    colorId?: string
  }>,
  timeZone: string,
): CalendarEvent[] {
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

  const data = (await res.json()) as {
    items?: Array<{
      id: string
      summary?: string
      description?: string
      start: { dateTime?: string; date?: string }
      end: { dateTime?: string; date?: string }
      colorId?: string
    }>
  }

  return normalizeEvents(data.items ?? [], timeZone)
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
          scope: (body.scope as string) ?? tokenData.scope ?? SCOPES,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

      if (error) {
        return jsonResponse({ ok: false, error: error.message })
      }
      return jsonResponse({ ok: true })
    }

    if (action === 'store') {
      const refreshToken = body.refresh_token as string | undefined
      if (!refreshToken?.trim()) {
        return jsonResponse({ ok: false, error: 'refresh_token is required' })
      }

      const { error } = await admin.from('google_oauth').upsert(
        {
          user_id: user.id,
          refresh_token: refreshToken.trim(),
          scope: (body.scope as string) ?? SCOPES,
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
        .select('refresh_token')
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
        let calendarColor: string | null = null
        try {
          const res = await fetch(`${CALENDAR_API}/users/me/calendarList/primary`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (res.ok) calendarColor = ((await res.json()) as { backgroundColor?: string }).backgroundColor ?? null
        } catch {
          /* ignore */
        }
        return jsonResponse({ events, calendarColor, connected: true })
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

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return jsonResponse({ ok: false, error: message })
  }
})
