import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncSnapshot } from './syncMerge'
import type { SettingTable } from './supabaseData'

/**
 * 他の端末の変更で同期を起こす（Supabase Realtime の Postgres の変更の通知、#410。表は `038` で publication に入れた）。
 * 通知は合図にだけ使い、中身はこれまでどおり差分（`sync_changes_since`）で取る。
 * 購読するのは本人の行の INSERT と UPDATE だけ（DELETE の通知は RLS が効かず、他の人の主キーが届きうる）。
 * 行を消したことは `sync_tombstones` の INSERT / UPDATE（同じ行をまた消すと deleted_at を書き直す）で知る
 */

const SYNC_TABLE_KIND = { lists: 'lists', list_sections: 'sections', tasks: 'tasks', habits: 'habits' } as const satisfies Record<
  string,
  keyof SyncSnapshot
>
type WakeSyncTable = keyof typeof SYNC_TABLE_KIND

const SETTING_TABLES = [
  'user_settings',
  'user_extra_time_zones',
  'user_active_timer',
  'user_event_templates',
  'user_course_links',
  'user_timetable',
  'user_addons',
  'user_sleep_timer',
] as const satisfies readonly SettingTable[]

export const WAKE_TABLES = [
  ...(Object.keys(SYNC_TABLE_KIND) as WakeSyncTable[]),
  'sync_tombstones',
  ...SETTING_TABLES,
  'day_moods',
] as const
export type WakeTable = (typeof WAKE_TABLES)[number]

/** 届いた通知（表と、変わった後の行） */
export interface WakeEvent {
  table: WakeTable
  row: Record<string, unknown>
}

/**
 * サーバーの時刻をマイクロ秒の数に。PostgREST（`2026-10-14T08:00:00.123456+00:00`）と
 * Realtime（`2026-10-14 08:00:00.123456+00` のこともある）で書き方が違っても同じ時刻なら同じ数。読めなければ null
 */
export function stampMicros(s: unknown): number | null {
  if (typeof s !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6})\d*)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(s.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, sec, frac = '', zone = 'Z'] = m
  let offsetMin = 0
  if (zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1
    const digits = zone.slice(1).replace(':', '')
    offsetMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || '0'))
  }
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)) - offsetMin * 60_000
  return ms * 1000 + Number(frac.padEnd(6, '0'))
}

const sameStamp = (a: unknown, b: unknown) => {
  const x = stampMicros(a)
  return x !== null && x === stampMicros(b)
}

/** こだまかどうかを決めるための、この端末が知っているサーバーの版 */
export interface EchoContext {
  /** 前回取得したサーバーの内容（と、その後この端末が送れた行） */
  mirror: SyncSnapshot | null
  /** 設定の表ごとの、もとにしたサーバーの版 */
  settingSyncedAt: (table: (typeof SETTING_TABLES)[number]) => string | null
  /** 1 日の気分の、もとにしたサーバーの版 */
  moodSyncedAt: (day: string) => string | null
}

/**
 * この端末がもう知っている変更の通知（自分が送った行のこだま・取得済みの行）か。知らない変更なら false（同期を起こす）。
 * 行・設定・気分は版（updated_at）が手元の版と同じなら知っている。消えた印は、その行がもう前回の内容に無ければ知っている
 */
export function isKnownChange(e: WakeEvent, ctx: EchoContext): boolean {
  const { table, row } = e
  if (table in SYNC_TABLE_KIND) {
    const rows = ctx.mirror?.[SYNC_TABLE_KIND[table as WakeSyncTable]] as { id: string; updatedAt?: string }[] | undefined
    const mine = rows?.find((x) => x.id === row.id)
    return !!mine && sameStamp(mine.updatedAt, row.updated_at)
  }
  if (table === 'sync_tombstones') {
    const kind = SYNC_TABLE_KIND[row.table_name as WakeSyncTable] as keyof SyncSnapshot | undefined
    if (!kind || !ctx.mirror) return false
    return !(ctx.mirror[kind] as { id: string }[]).some((x) => x.id === row.row_id)
  }
  if (table === 'day_moods') return typeof row.day === 'string' && sameStamp(ctx.moodSyncedAt(row.day), row.updated_at)
  return sameStamp(ctx.settingSyncedAt(table as (typeof SETTING_TABLES)[number]), row.updated_at)
}

/**
 * 本人の行の変更の通知を購読する。`onStatus` は購読できている間 true（切れた・失敗したら false）で、`status` は Realtime の状態の名前
 * （`SUBSCRIBED`・`CHANNEL_ERROR`・`TIMED_OUT`・`CLOSED`。やめたときは無し）。返した関数でやめる。
 * クライアントに Realtime が無ければ（テストの偽物など）何もしない
 */
export function subscribeSyncWake(
  supabase: SupabaseClient,
  userId: string,
  handlers: { onChange: (e: WakeEvent) => void; onStatus: (live: boolean, status?: string) => void },
): () => void {
  if (typeof supabase.channel !== 'function') return () => {}
  const channel = supabase.channel(`sync-wake:${userId}`)
  const filter = `user_id=eq.${userId}`
  for (const table of WAKE_TABLES) {
    for (const event of ['INSERT', 'UPDATE'] as const) {
      channel.on('postgres_changes', { event, schema: 'public', table, filter }, (payload: { new: Record<string, unknown> }) =>
        handlers.onChange({ table, row: payload.new ?? {} }),
      )
    }
  }
  channel.subscribe((status) => handlers.onStatus(status === 'SUBSCRIBED', status))
  return () => {
    handlers.onStatus(false)
    void supabase.removeChannel(channel)
  }
}
