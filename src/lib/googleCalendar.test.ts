import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'

const invoke = vi.fn()
vi.mock('./supabase', () => ({
  getSupabase: () => ({ functions: { invoke } }),
  isSupabaseConfigured: true,
}))

const { fetchCalendarEvents, localizeGoogleError, shouldDisconnectAfterFetchError } = await import('./googleCalendar')

/** 関数が 2xx 以外で返したとき（supabase-js は本文を error.context に入れる） */
function failWith(status: number, body: Record<string, unknown>) {
  return { data: null, error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })) }
}

const actions = () => invoke.mock.calls.map(([, opts]) => (opts as { body: { action: string } }).body.action)

describe('shouldDisconnectAfterFetchError', () => {
  it('利用上限では連携を外さない', () => {
    expect(shouldDisconnectAfterFetchError('Google Calendar: too many requests. Wait a moment, then try again.')).toBe(false)
    expect(shouldDisconnectAfterFetchError('Too many requests. Wait a moment, then try again.')).toBe(false)
    expect(shouldDisconnectAfterFetchError('google_rate_limited')).toBe(false)
  })

  it('認証切れ・許可不足・未接続では外す', () => {
    expect(shouldDisconnectAfterFetchError('Google Calendar authorization expired. Disconnect and reconnect.')).toBe(true)
    expect(shouldDisconnectAfterFetchError('Google Calendar scope not granted. Reconnect and approve calendar access.')).toBe(true)
    expect(shouldDisconnectAfterFetchError('Google Calendar not connected. Reconnect in settings.')).toBe(true)
  })

  it('Google の一時的な失敗では外さない', () => {
    expect(shouldDisconnectAfterFetchError('Google Calendar request failed')).toBe(false)
  })
})

describe('localizeGoogleError', () => {
  it('利用上限は「少し待って」', () => {
    const t = (key: string) => key
    expect(localizeGoogleError('Google Calendar: too many requests. Wait a moment, then try again.', t)).toBe('planVsActual.rateLimited')
    expect(localizeGoogleError('google_rate_limited', t)).toBe('planVsActual.rateLimited')
  })
})

describe('fetchCalendarEvents', () => {
  beforeEach(() => invoke.mockReset())

  it('利用上限（429）では連携を外さない', async () => {
    invoke.mockResolvedValueOnce(
      failWith(429, {
        ok: false,
        events: [],
        connected: true,
        code: 'google_rate_limited',
        error: 'Google Calendar: too many requests. Wait a moment, then try again.',
      }),
    )
    await expect(fetchCalendarEvents(new Date(), new Date())).rejects.toThrow(/too many requests/i)
    expect(actions()).toEqual(['events'])
  })

  it('認証切れ（409）では今までどおり連携を外す', async () => {
    invoke
      .mockResolvedValueOnce(
        failWith(409, {
          ok: false,
          events: [],
          connected: false,
          code: 'google_auth_expired',
          error: 'Google Calendar authorization expired. Disconnect and reconnect.',
        }),
      )
      .mockResolvedValueOnce({ data: { ok: true }, error: null })
    await expect(fetchCalendarEvents(new Date(), new Date())).rejects.toThrow(/authorization expired/)
    expect(actions()).toEqual(['events', 'disconnect'])
  })

  it('古い関数の 502（認証切れ）でも外す', async () => {
    invoke
      .mockResolvedValueOnce(
        failWith(502, {
          ok: false,
          events: [],
          connected: false,
          error: 'Google Calendar authorization expired. Disconnect and reconnect.',
        }),
      )
      .mockResolvedValueOnce({ data: { ok: true }, error: null })
    await expect(fetchCalendarEvents(new Date(), new Date())).rejects.toThrow()
    expect(actions()).toEqual(['events', 'disconnect'])
  })
})
