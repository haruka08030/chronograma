import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from '../types/calendarEvent'

/** 前に取った予定を先に出し、取り直して入れ替え、前後の週を先に読む（#423） */
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('../lib/googleCalendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/googleCalendar')>()),
  fetchCalendarEvents: mocks.fetch,
}))
vi.mock('../contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../contexts/AuthContext')>()),
  useAuth: () => ({ user: { id: 'u1' } }),
}))

const { useGoogleCalendarEvents } = await import('./useGoogleCalendarEvents')
const { useTaskStore } = await import('../store/taskStore')
const { cacheGoogleEvents, cachedGoogleEvents, rangeKey } = await import('../lib/googleEventCache')
const { appTimeZone } = await import('../lib/timeZone')

const ev = (id: string, date: string): CalendarEvent => ({
  id,
  summary: id,
  start: `${date}T01:00:00Z`,
  end: `${date}T02:00:00Z`,
  startTime: '10:00',
  endTime: '11:00',
  date,
  isAllDay: false,
})

const from = new Date(2026, 9, 12)
const to = new Date(2026, 9, 18, 23, 59, 59)
const key = (a: Date, b: Date) => rangeKey(a, b, appTimeZone())
const ids = () => useTaskStore.getState().calendarEvents.map((e) => e.id)

beforeEach(() => {
  localStorage.clear()
  mocks.fetch.mockReset()
  useTaskStore.getState().setCalendarEvents([])
  useTaskStore.getState().setGoogleConnected(true)
  useTaskStore.getState().setGoogleReconnectNeeded(false)
})

describe('useGoogleCalendarEvents', () => {
  it('前に取った予定をすぐ出し、届いたら入れ替えて覚え直す', async () => {
    cacheGoogleEvents('u1', key(from, to), [ev('old', '2026-10-14')])
    let resolve!: (v: { events: CalendarEvent[]; canWrite: boolean }) => void
    mocks.fetch.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    mocks.fetch.mockResolvedValue({ events: [], canWrite: true })

    renderHook(() => useGoogleCalendarEvents(from, to))
    expect(ids()).toEqual(['old'])

    await act(async () => resolve({ events: [ev('new', '2026-10-14')], canWrite: true }))
    expect(ids()).toEqual(['new'])
    expect(cachedGoogleEvents('u1', key(from, to))?.events.map((e) => e.id)).toEqual(['new'])
  })

  it('取れたあと、前後の週を読んで覚えておく', async () => {
    mocks.fetch.mockResolvedValue({ events: [], canWrite: true })
    renderHook(() => useGoogleCalendarEvents(from, to))
    await act(async () => {})

    const prev = [new Date(2026, 9, 5), new Date(2026, 9, 11, 23, 59, 59)] as const
    const next = [new Date(2026, 9, 19), new Date(2026, 9, 25, 23, 59, 59)] as const
    const asked = mocks.fetch.mock.calls.map((call) => key(call[0] as Date, call[1] as Date))
    expect(asked).toEqual([key(from, to), key(...prev), key(...next)])
    expect(cachedGoogleEvents('u1', key(...prev))).not.toBeNull()
    expect(cachedGoogleEvents('u1', key(...next))).not.toBeNull()
  })

  it('月のように長い範囲は前後を読まない', async () => {
    mocks.fetch.mockResolvedValue({ events: [], canWrite: true })
    renderHook(() => useGoogleCalendarEvents(new Date(2026, 8, 28), new Date(2026, 10, 8, 23, 59, 59)))
    await act(async () => {})
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('接続が切れたら外さずに「もう一度接続する」を出し、知らせ、次に開いたときのために覚える（#449）', async () => {
    mocks.fetch.mockRejectedValue(new Error('Google Calendar authorization expired. Disconnect and reconnect.'))
    renderHook(() => useGoogleCalendarEvents(from, to))
    await act(async () => {})
    const s = useTaskStore.getState()
    expect(s.googleConnected).toBe(false)
    expect(s.googleReconnectNeeded).toBe(true)
    expect(s.googleConnectionError).toBeNull()
    expect(localStorage.getItem('chronograma.googleConnected')).toBe('u1:lost')
    // つなぎ直したら消える
    s.setGoogleConnected(true)
    expect(useTaskStore.getState().googleReconnectNeeded).toBe(false)
  })

  it('一時的な失敗では「もう一度接続する」を出さない', async () => {
    mocks.fetch.mockRejectedValue(new Error('Google Calendar request failed'))
    renderHook(() => useGoogleCalendarEvents(from, to))
    await act(async () => {})
    expect(useTaskStore.getState().googleConnected).toBe(true)
    expect(useTaskStore.getState().googleReconnectNeeded).toBe(false)
  })
})
