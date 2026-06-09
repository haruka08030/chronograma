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

function formatYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatHm(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function normalizeEvents(items: Array<{
  id: string
  summary?: string
  description?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  colorId?: string
}>): CalendarEvent[] {
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
      const s = new Date(startDt)
      const e = new Date(endDt)
      date = formatYmd(s)
      startTime = formatHm(s)
      endTime = formatHm(e)
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

  return normalizeEvents(data.items ?? [])
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

    if (action === 'store') {
      const refreshToken = body.refresh_token as string | undefined
      if (!refreshToken?.trim()) {
        return jsonResponse({ error: 'refresh_token is required' }, 400)
      }

      const { error } = await admin.from('google_oauth').upsert({
        user_id: user.id,
        refresh_token: refreshToken.trim(),
        scope: (body.scope as string) ?? SCOPES,
        updated_at: new Date().toISOString(),
      })

      if (error) {
        return jsonResponse({ error: error.message }, 500)
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
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (fetchError) {
        return jsonResponse({ error: fetchError.message }, 500)
      }
      return jsonResponse({ connected: !!row })
    }

    if (action === 'events') {
      const timeMin = body.timeMin as string | undefined
      const timeMax = body.timeMax as string | undefined
      if (!timeMin || !timeMax) {
        return jsonResponse({ error: 'timeMin and timeMax are required' }, 400)
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
        return jsonResponse(
          { error: 'Google Calendar not connected. Reconnect in settings.' },
          404,
        )
      }

      const accessToken = await refreshGoogleAccessToken(row.refresh_token)
      const events = await fetchGoogleEvents(accessToken, timeMin, timeMax)
      return jsonResponse({ events })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: message }, 500)
  }
})
