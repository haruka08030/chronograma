import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { CalendarEvent } from '../types/calendarEvent'

const invoke = vi.fn()
vi.mock('./supabase', () => ({
  getSupabase: () => ({ functions: { invoke } }),
  isSupabaseConfigured: true,
}))

const {
  applyTimingLocally,
  fetchCalendarEvents,
  googleEventTiming,
  localizeGoogleError,
  movedGoogleEventTiming,
  shouldDisconnectAfterFetchError,
  updateGoogleEvent,
} = await import('./googleCalendar')
const { setAppTimeZoneSetting } = await import('./timeZone')

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

describe('Google の予定を動かしたときに送る start / end（日数・長さを保つ）', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue({ data: { ok: true, event: null }, error: null })
    setAppTimeZoneSetting('Asia/Tokyo')
  })

  /** 10/10〜10/12 の終日の予定（Google の終日は終わりの日を含まない） */
  const trip = {
    id: 'trip',
    summary: '旅行',
    start: '2026-10-10',
    end: '2026-10-13',
    date: '2026-10-10',
    startTime: null,
    endTime: null,
    isAllDay: true,
  } as CalendarEvent
  /** 10/10 10:00〜10/12 12:00（東京）の合宿 */
  const camp = {
    id: 'camp',
    summary: '合宿',
    start: '2026-10-10T01:00:00.000Z',
    end: '2026-10-12T03:00:00.000Z',
    date: '2026-10-10',
    startTime: '10:00',
    endTime: '12:00',
    isAllDay: false,
  } as CalendarEvent

  const sentFields = () => (invoke.mock.calls.at(-1)![1] as { body: { action: string; fields: unknown } }).body

  it('月表示: 3 日間の終日の予定を 10/17 へ動かすと 10/17〜10/19 のまま送る', async () => {
    await updateGoogleEvent(trip.id, { timing: movedGoogleEventTiming(trip, '2026-10-17') })
    expect(sentFields()).toMatchObject({
      action: 'update',
      fields: { start: { date: '2026-10-17' }, end: { date: '2026-10-20' } },
    })
  })

  it('月表示: 日をまたぐ時刻つきの予定は時刻と長さを保って 10/17 10:00〜10/19 12:00 を送る', async () => {
    await updateGoogleEvent(camp.id, { timing: movedGoogleEventTiming(camp, '2026-10-17') })
    expect(sentFields().fields).toEqual({
      start: { dateTime: '2026-10-17T10:00:00', timeZone: 'Asia/Tokyo' },
      end: { dateTime: '2026-10-19T12:00:00', timeZone: 'Asia/Tokyo' },
    })
  })

  it('週のタイムライン・カード: 開始の時刻を変えても長さ（50 時間）を保つ', async () => {
    await updateGoogleEvent(camp.id, { timing: movedGoogleEventTiming(camp, '2026-10-17', '23:30') })
    expect(sentFields().fields).toEqual({
      start: { dateTime: '2026-10-17T23:30:00', timeZone: 'Asia/Tokyo' },
      end: { dateTime: '2026-10-20T01:30:00', timeZone: 'Asia/Tokyo' },
    })
  })

  it('1 日だけの予定・夜をまたぐ予定はそのままの長さ', () => {
    expect(movedGoogleEventTiming({ ...trip, end: '2026-10-11' }, '2026-10-17')).toEqual({
      date: '2026-10-17',
      endDate: null,
      startTime: null,
      endTime: null,
    })
    const night = {
      ...camp,
      start: '2026-10-10T13:00:00.000Z',
      end: '2026-10-10T17:00:00.000Z',
      startTime: '22:00',
      endTime: '02:00',
    } as CalendarEvent
    expect(movedGoogleEventTiming(night, '2026-10-17')).toEqual({
      date: '2026-10-17',
      endDate: '2026-10-18',
      startTime: '22:00',
      endTime: '02:00',
    })
  })

  it('画面に先に出す形（楽観表示）も日数を保つ', () => {
    const moved = applyTimingLocally(camp, movedGoogleEventTiming(camp, '2026-10-17'))
    expect(googleEventTiming(moved)).toEqual({ date: '2026-10-17', endDate: '2026-10-19', startTime: '10:00', endTime: '12:00' })
    const movedTrip = applyTimingLocally(trip, movedGoogleEventTiming(trip, '2026-10-17'))
    expect(movedTrip.end.slice(0, 10)).toBe('2026-10-20')
  })
})
