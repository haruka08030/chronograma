// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../types/calendarEvent'
import {
  MAX_AGE_MS,
  MAX_RANGES,
  cacheGoogleEvents,
  cachedGoogleEvents,
  clearGoogleEventCache,
  dropCachedGoogleEvent,
} from './googleEventCache'

const ev = (id: string): CalendarEvent => ({
  id,
  summary: id,
  start: '2026-10-14T01:00:00Z',
  end: '2026-10-14T02:00:00Z',
  startTime: '10:00',
  endTime: '11:00',
  date: '2026-10-14',
  isAllDay: false,
})

beforeEach(() => localStorage.clear())

describe('googleEventCache', () => {
  it('持ち主ごとに範囲の予定を覚え、ほかの人には出さない', () => {
    cacheGoogleEvents('u1', 'week', [ev('a')], 1000)
    expect(cachedGoogleEvents('u1', 'week', 2000)).toEqual({ at: 1000, events: [ev('a')] })
    expect(cachedGoogleEvents('u2', 'week', 2000)).toBeNull()
    expect(cachedGoogleEvents('u1', 'other', 2000)).toBeNull()
  })

  it('古すぎるものは出さない', () => {
    cacheGoogleEvents('u1', 'week', [ev('a')], 0)
    expect(cachedGoogleEvents('u1', 'week', MAX_AGE_MS + 1)).toBeNull()
  })

  it('覚える範囲は新しいものから決まった数まで', () => {
    for (let i = 0; i <= MAX_RANGES; i++) cacheGoogleEvents('u1', `r${i}`, [], i)
    expect(cachedGoogleEvents('u1', 'r0', MAX_RANGES)).toBeNull()
    expect(cachedGoogleEvents('u1', `r${MAX_RANGES}`, MAX_RANGES)).not.toBeNull()
  })

  it('書き込んだ予定はどの範囲からも外し、消すと全部無くなる', () => {
    cacheGoogleEvents('u1', 'w1', [ev('a'), ev('b')], 1)
    cacheGoogleEvents('u1', 'w2', [ev('a')], 1)
    dropCachedGoogleEvent('a')
    expect(cachedGoogleEvents('u1', 'w1', 1)?.events).toEqual([ev('b')])
    expect(cachedGoogleEvents('u1', 'w2', 1)?.events).toEqual([])
    clearGoogleEventCache()
    expect(cachedGoogleEvents('u1', 'w1', 1)).toBeNull()
  })
})
