import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { withCors } from '../_shared/cors.ts'
import { RATE_LIMITS, withinRateLimit } from '../_shared/rateLimit.ts'
import { needsSeal, openSecret, requireSecretKey, sealSecret, SecretKeyMissingError, secretContext } from '../_shared/secretBox.ts'

// 自分のカレンダーの予定の読み書き（events.owned）＋カレンダーの色の取得（calendarlist.readonly）。
// 使うのは primary カレンダーだけなので、いちばん狭いものにしている。`src/lib/googleCalendar.ts` とそろえる
const SCOPES =
  'https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendarlist.readonly'
/** 予定を書き換えられるスコープ。前の版でつないだ接続は calendar.events を持っている */
const WRITE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar',
]
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

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
    headers: { 'Content-Type': 'application/json' },
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
  return (scope ?? '').split(/\s+/).some((s) => WRITE_SCOPES.includes(s))
}

Deno.serve(withCors(async (req) => {
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
    if (!(await withinRateLimit(admin, user.id, RATE_LIMITS.google))) {
      return jsonResponse({ ok: false, error: 'Too many requests. Wait a moment, then try again.' }, 429)
    }
    const body = req.method === 'POST' ? await req.json() : {}
    const action = (body.action as string) ?? ''

    const tokenContext = secretContext.google(user.id)
    /**
     * 保存してある接続（リフレッシュトークンは開いたもの）。暗号化する前の行は、読んだついでに暗号化して書き直す
     */
    const loadConnection = async (): Promise<{ row: { refresh_token: string; scope: string | null } | null; error: { message: string } | null }> => {
      const { data, error } = await admin
        .from('google_oauth')
        .select('refresh_token, scope')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error || !data?.refresh_token) return { row: null, error }
      const refreshToken = await openSecret(data.refresh_token as string, tokenContext)
      if (needsSeal(data.refresh_token as string)) {
        await admin
          .from('google_oauth')
          .update({ refresh_token: await sealSecret(refreshToken, tokenContext) })
          .eq('user_id', user.id)
      }
      return { row: { refresh_token: refreshToken, scope: data.scope as string | null }, error: null }
    }

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
      // コードは 1 回しか交換できないので、保存できないと分かっていれば交換する前に止める
      requireSecretKey()

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
        // 応答の本文はログにだけ残す。クライアントが見分ける error（invalid_grant / redirect_uri_mismatch /
        // invalid_client など）だけを返す
        const bodyText = await tokenRes.text()
        console.error('[google] code exchange failed', tokenRes.status, bodyText)
        let code = ''
        try {
          const parsed = JSON.parse(bodyText) as { error?: unknown }
          if (typeof parsed.error === 'string' && /^[a-z_]{1,64}$/.test(parsed.error)) code = parsed.error
        } catch {
          /* JSON でなければ code なし */
        }
        return jsonResponse({
          ok: false,
          error: `Google code exchange failed: ${code || tokenRes.status}`,
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
          refresh_token: await sealSecret(refreshToken, tokenContext),
          // ユーザーが同意画面で書き込みを外すこともあるので、実際に許可された範囲を保存する
          scope: tokenData.scope ?? SCOPES,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

      if (error) {
        console.error('[google] save token failed', error.message)
        return jsonResponse({ ok: false, error: 'Failed to save Google connection' })
      }
      return jsonResponse({ ok: true })
    }

    if (action === 'disconnect') {
      // 行を消すだけでは Google 側の許可が残るので、先に取り消す（失敗しても切断は進める）
      const { row: current } = await loadConnection().catch(() => ({ row: null }))
      if (current?.refresh_token) {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: current.refresh_token }),
        }).catch((err) => console.error('[google] revoke failed', err))
      }
      const { error } = await admin
        .from('google_oauth')
        .delete()
        .eq('user_id', user.id)

      if (error) {
        console.error('[google] disconnect failed', error.message)
        return jsonResponse({ error: 'Failed to disconnect' }, 500)
      }
      return jsonResponse({ ok: true })
    }

    if (action === 'status') {
      const { row, error: fetchError } = await loadConnection()

      if (fetchError) {
        console.error('[google] load connection failed', fetchError.message)
        return jsonResponse({ error: 'Failed to load Google connection' }, 500)
      }
      if (!row?.refresh_token) {
        return jsonResponse({ connected: false })
      }

      try {
        await refreshGoogleAccessToken(row.refresh_token)
        return jsonResponse({ connected: true })
      } catch (e) {
        // 取り消された・期限切れのときだけ連携を外す。通信の失敗や Google の一時的なエラー、
        // サーバーの設定ミスで全員の連携を外さない
        const message = e instanceof Error ? e.message : String(e)
        if (message.includes('invalid_grant')) {
          await admin.from('google_oauth').delete().eq('user_id', user.id)
          return jsonResponse({ connected: false, stale: true })
        }
        console.error('[google] status refresh failed', message)
        return jsonResponse({ connected: true, error: 'Google is temporarily unavailable' })
      }
    }

    if (action === 'events') {
      const timeMin = body.timeMin as string | undefined
      const timeMax = body.timeMax as string | undefined
      if (!timeMin || !timeMax) {
        return jsonResponse({ events: [], error: 'timeMin and timeMax are required' })
      }

      const { row, error: fetchError } = await loadConnection()

      if (fetchError) {
        console.error('[google] load connection failed', fetchError.message)
        return jsonResponse({ error: 'Failed to load Google connection' }, 500)
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
        if (!needsReconnect) console.error('[google] events failed', message)
        return jsonResponse({
          events: [],
          connected: false,
          error: scopeMissing
            ? 'Google Calendar scope not granted. Reconnect and approve calendar access.'
            : needsReconnect
              ? 'Google Calendar authorization expired. Disconnect and reconnect.'
              : 'Google Calendar request failed',
        })
      }
    }

    if (action === 'create' || action === 'update' || action === 'delete') {
      const { row, error: fetchError } = await loadConnection()
      if (fetchError) {
        console.error('[google] load connection failed', fetchError.message)
        return jsonResponse({ ok: false, error: 'Failed to load Google connection' }, 500)
      }
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
        console.error('[google] write failed', message)
        return jsonResponse({ ok: false, error: 'Google Calendar write failed' })
      }
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (e) {
    if (e instanceof SecretKeyMissingError) {
      console.error('[google]', e.message)
      return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500)
    }
    // 内部のエラーは中身を返さず、サーバーのログにだけ残す
    console.error('[google]', e)
    return jsonResponse({ ok: false, error: 'Internal error' })
  }
}))
