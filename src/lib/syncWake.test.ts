import { describe, expect, it } from 'vitest'
import { isKnownChange, stampMicros, type EchoContext } from './syncWake'
import type { SyncSnapshot } from './syncMerge'

describe('stampMicros', () => {
  it('PostgREST と Realtime の書き方の違う同じ時刻を同じ数にする', () => {
    const a = stampMicros('2026-10-14T08:00:00.123456+00:00')
    expect(a).not.toBeNull()
    expect(stampMicros('2026-10-14 08:00:00.123456+00')).toBe(a)
    expect(stampMicros('2026-10-14T17:00:00.123456+09:00')).toBe(a)
    expect(stampMicros('2026-10-14T08:00:00.123456Z')).toBe(a)
  })

  it('マイクロ秒の違いを見分ける。小数の無い時刻も読む', () => {
    expect(stampMicros('2026-10-14T08:00:00.123457+00:00')).not.toBe(stampMicros('2026-10-14T08:00:00.123456+00:00'))
    expect(stampMicros('2026-10-14 08:00:00+00')).toBe(stampMicros('2026-10-14T08:00:00.000000+00:00'))
    expect(stampMicros('2026-10-14T08:00:00.12+00:00')).toBe(stampMicros('2026-10-14T08:00:00.120000+00:00'))
  })

  it('時刻でなければ null', () => {
    expect(stampMicros(null)).toBeNull()
    expect(stampMicros('')).toBeNull()
    expect(stampMicros('yesterday')).toBeNull()
  })
})

describe('isKnownChange', () => {
  const at = '2026-10-14T08:00:00.123456+00:00'
  const mirror: SyncSnapshot = {
    lists: [],
    sections: [],
    habits: [],
    tasks: [{ id: 'a', updatedAt: at } as SyncSnapshot['tasks'][number]],
  }
  const ctx: EchoContext = {
    mirror,
    settingSyncedAt: (t) => (t === 'user_active_timer' ? at : null),
    moodSyncedAt: (day) => (day === '2026-10-14' ? at : null),
  }

  it('行は前回の内容と同じ版なら知っている（自分が送った行のこだま）。版が違う・知らない行は知らない', () => {
    expect(isKnownChange({ table: 'tasks', row: { id: 'a', updated_at: '2026-10-14 08:00:00.123456+00' } }, ctx)).toBe(true)
    expect(isKnownChange({ table: 'tasks', row: { id: 'a', updated_at: '2026-10-14T08:00:01.000000+00:00' } }, ctx)).toBe(false)
    expect(isKnownChange({ table: 'tasks', row: { id: 'b', updated_at: at } }, ctx)).toBe(false)
    expect(isKnownChange({ table: 'habits', row: { id: 'a', updated_at: at } }, ctx)).toBe(false)
  })

  it('消えた印は、その行がもう前回の内容に無ければ知っている', () => {
    expect(isKnownChange({ table: 'sync_tombstones', row: { table_name: 'tasks', row_id: 'gone' } }, ctx)).toBe(true)
    expect(isKnownChange({ table: 'sync_tombstones', row: { table_name: 'tasks', row_id: 'a' } }, ctx)).toBe(false)
  })

  it('設定・気分はもとにした版と同じなら知っている', () => {
    expect(isKnownChange({ table: 'user_active_timer', row: { updated_at: at } }, ctx)).toBe(true)
    expect(isKnownChange({ table: 'user_settings', row: { updated_at: at } }, ctx)).toBe(false)
    expect(isKnownChange({ table: 'day_moods', row: { day: '2026-10-14', updated_at: at } }, ctx)).toBe(true)
    expect(isKnownChange({ table: 'day_moods', row: { day: '2026-10-13', updated_at: at } }, ctx)).toBe(false)
  })

  it('まだ何も取得していなければ、どれも知らない', () => {
    const empty = { ...ctx, mirror: null }
    expect(isKnownChange({ table: 'tasks', row: { id: 'a', updated_at: at } }, empty)).toBe(false)
    expect(isKnownChange({ table: 'sync_tombstones', row: { table_name: 'tasks', row_id: 'gone' } }, empty)).toBe(false)
  })
})
