import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { pushListsTasksHabits, type SyncChanges } from './supabaseData'
import {
  advanceCursor,
  applyChanges,
  afterPush,
  createPullState,
  DELTA_OVERLAP_MS,
  FULL_FETCH_INTERVAL_MS,
  missingWithoutTombstone,
  needsFullFetch,
  pullRemote,
  type PullState,
} from './syncPull'
import {
  baselineFrom,
  mergeSnapshots,
  mergeWithoutBaseline,
  syncedSnapshot,
  withServerStamps,
  type SyncBaseline,
  type SyncSnapshot,
} from './syncMerge'
import type { Task } from '../types/task'

type Row = Record<string, unknown> & { user_id: string }

/** ISO 文字列（マイクロ秒まで）→ エポックからのマイクロ秒 */
function micros(v: unknown): number {
  const m = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)$/.exec(String(v))
  if (!m) return Number.NaN
  return Date.parse(m[1] + m[3]) * 1000 + Number((m[2] ?? '').padEnd(6, '0').slice(0, 6))
}
const fromMicros = (us: number) => {
  const ms = Math.floor(us / 1000)
  return new Date(ms).toISOString().replace(/\.(\d{3})Z$/, (_, s: string) => `.${s}${String(us % 1000).padStart(3, '0')}+00:00`)
}
const isStamp = (col: string) => col.endsWith('_at')
const cmp = (col: string, a: unknown, b: unknown) => {
  if (isStamp(col)) return micros(a) - micros(b)
  const x = String(a)
  const y = String(b)
  return x < y ? -1 : x > y ? 1 : 0
}

/** PostgREST の or の中身（`a.gt."x",and(a.eq."x",b.gt."y")`）を、行を受け取る条件に */
function parseOr(text: string): (r: Row) => boolean {
  const split = (s: string) => {
    const out: string[] = []
    let depth = 0
    let quoted = false
    let cur = ''
    for (let i = 0; i < s.length; i++) {
      const c = s[i]!
      if (quoted && c === '\\') {
        cur += c + s[++i]
        continue
      }
      if (c === '"') quoted = !quoted
      else if (!quoted && c === '(') depth++
      else if (!quoted && c === ')') depth--
      if (!quoted && depth === 0 && c === ',') {
        out.push(cur)
        cur = ''
        continue
      }
      cur += c
    }
    if (cur) out.push(cur)
    return out
  }
  const term = (t: string): ((r: Row) => boolean) => {
    if (t.startsWith('and(')) {
      const parts = split(t.slice(4, -1)).map(term)
      return (r) => parts.every((p) => p(r))
    }
    const [col, op] = t.split('.', 2) as [string, string]
    let value = t.slice(col.length + op.length + 2)
    if (value.startsWith('"')) value = value.slice(1, -1).replace(/\\(.)/g, '$1')
    if (op === 'eq') return (r) => cmp(col, r[col], value) === 0
    if (op === 'gt') return (r) => cmp(col, r[col], value) > 0
    throw new Error(`op ${op}`)
  }
  const terms = split(text).map(term)
  return (r) => terms.some((p) => p(r))
}

/**
 * PostgREST と DB の偽物。書き込みは `004` の sync_write_guard（文ごとに 1 つのサーバーの時刻）、
 * 消すと `008` の印、同じ id が入り直すと印を消す。`noTombstones` は `008` を流す前の DB
 */
function fakeDb(opts: { maxRows?: number; noTombstones?: boolean } = {}) {
  const maxRows = opts.maxRows ?? 1000
  const tables: Record<string, Row[]> = { lists: [], list_sections: [], tasks: [], habits: [], sync_tombstones: [] }
  let clock = micros('2026-10-03T00:00:00.000000+00:00')
  /** サーバーの now()（呼ぶたびに 1 マイクロ秒進む。文の中では同じ） */
  const now = () => fromMicros(++clock)
  /** 取得で返した行の数（表ごと） */
  const downloaded: Record<string, number> = {}
  const tombstone = (userId: string, table: string, id: string, at: string) => {
    const ts = tables.sync_tombstones!
    const i = ts.findIndex((t) => t.user_id === userId && t.table_name === table && t.row_id === id)
    const row = { user_id: userId, table_name: table, row_id: id, deleted_at: at }
    if (i >= 0) ts[i] = row
    else ts.push(row)
  }
  const untombstone = (userId: string, table: string, id: string) => {
    tables.sync_tombstones = tables.sync_tombstones!.filter((t) => !(t.user_id === userId && t.table_name === table && t.row_id === id))
  }
  const write = (table: string, rows: Row[]): Row[] => {
    const all = (tables[table] ??= [])
    const stamp = now()
    const out: Row[] = []
    for (const { base_updated_at: base, ...row } of rows) {
      const i = all.findIndex((r) => r.user_id === row.user_id && r.id === row.id)
      const old = i >= 0 ? all[i] : undefined
      let next: Row
      if (base === undefined) {
        if (old && micros(row.updated_at) < micros(old.updated_at)) continue
        next = { ...old, ...row } as Row
      } else {
        if (old && base !== old.updated_at) continue
        const at = old && micros(old.updated_at) >= micros(stamp) ? fromMicros(micros(old.updated_at) + 1) : stamp
        next = { ...old, ...row, updated_at: at } as Row
      }
      if (old) all[i] = next
      else {
        all.push(next)
        untombstone(next.user_id, table, String(next.id))
      }
      out.push(next)
    }
    return out
  }
  const remove = (table: string, match: (r: Row) => boolean) => {
    const at = now()
    const gone = (tables[table] ?? []).filter(match)
    tables[table] = (tables[table] ?? []).filter((r) => !gone.includes(r))
    for (const r of gone) tombstone(r.user_id, table, String(r.id), at)
    return gone
  }
  const client = {
    from(table: string) {
      return {
        select: (_cols: string, o?: { count?: string }) => {
          const filters: ((r: Row) => boolean)[] = []
          const orders: string[] = []
          const run = async (from: number, to: number) => {
            if (table === 'sync_tombstones' && opts.noTombstones) {
              return { data: null, count: null, error: { code: 'PGRST205', message: "Could not find the table 'public.sync_tombstones' in the schema cache" } }
            }
            const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
            rows.sort((a, b) => {
              for (const c of orders) {
                const d = cmp(c, a[c], b[c])
                if (d !== 0) return d
              }
              return 0
            })
            const data = rows.slice(from, Math.min(to + 1, from + maxRows))
            downloaded[table] = (downloaded[table] ?? 0) + data.length
            return { data, count: o?.count === 'exact' ? rows.length : null, error: null }
          }
          const q = {
            eq: (c: string, v: unknown) => (filters.push((r) => String(r[c]) === String(v)), q),
            gt: (c: string, v: unknown) => (filters.push((r) => cmp(c, r[c], v) > 0), q),
            or: (text: string) => (filters.push(parseOr(text)), q),
            order: (c: string) => (orders.push(c), q),
            limit: (n: number) => run(0, n - 1),
            range: (from: number, to: number) => run(from, to),
          }
          return q
        },
        upsert: (rows: Row[]) => ({
          select: async () => ({ data: write(table, rows).map((r) => ({ id: r.id, updated_at: r.updated_at })), error: null }),
        }),
        delete: () => {
          let userId = ''
          const q = {
            eq: (_c: string, v: string) => ((userId = v), q),
            in: async (_c: string, ids: string[]) => {
              remove(table, (r) => r.user_id === userId && ids.includes(String(r.id)))
              return { error: null }
            },
            or: (text: string) => ({
              select: async () => {
                const f = parseOr(text)
                const gone = remove(table, (r) => r.user_id === userId && f(r))
                return { data: gone.map((r) => ({ id: r.id })), error: null }
              },
            }),
          }
          return q
        },
      }
    },
  }
  return {
    client: client as unknown as SupabaseClient,
    tables,
    downloaded,
    /** サーバーの時計を進める */
    advance: (ms: number) => {
      clock += ms * 1000
    },
    serverNowMs: () => Math.floor(clock / 1000),
    /** 前の版のアプリの書き込み（base_updated_at なし、updated_at は端末の時計） */
    oldClientWrite: (table: string, row: Row) => write(table, [row]),
    resetDownloaded: () => {
      for (const k of Object.keys(downloaded)) delete downloaded[k]
    },
  }
}

const taskRow = (id: string, patch: Record<string, unknown> = {}): Row => ({
  id,
  user_id: 'u1',
  list_id: '__inbox__',
  parent_id: null,
  title: id,
  description: '',
  completed: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000000+00:00',
  sort_order: 0,
  due_date: null,
  start_time: null,
  end_time: null,
  priority: 'none',
  tags: [],
  recurrence: null,
  is_time_log: false,
  ...patch,
})
const inboxRow: Row = { id: '__inbox__', user_id: 'u1', name: 'Inbox', color: '#000', sort_order: 0, kind: 'tasks', updated_at: '2026-01-01T00:00:00.000000+00:00' }

const noDeletes = { lists: [], tasks: [], habits: [], sections: [] }
const emptySnap = (): SyncSnapshot => ({ lists: [], tasks: [], habits: [], sections: [] })

type Device = { local: SyncSnapshot; baseline: SyncBaseline | null; pull: PullState; clockMs: number; fullPulls: number; deltaPulls: number; refetches: number }
const newDevice = (db: ReturnType<typeof fakeDb>): Device => ({
  local: emptySnap(),
  baseline: null,
  pull: createPullState(),
  clockMs: db.serverNowMs(),
  fullPulls: 0,
  deltaPulls: 0,
  refetches: 0,
})

/** useSupabaseSync の 1 往復と同じ順: 取得（差分か全部）→ 確かめ → 三方向マージ → 送信 → 控えと前回の内容に入れる */
async function syncDevice(db: ReturnType<typeof fakeDb>, dev: Device, beforePush?: () => Promise<void>) {
  const known = dev.baseline
  let pulled = await pullRemote(db.client, 'u1', dev.pull, { full: !known, nowMs: dev.clockMs, clockOffsetMs: known?.clockOffsetMs })
  if ('error' in pulled) throw new Error(pulled.error)
  if (pulled.full) dev.fullPulls++
  else dev.deltaPulls++
  let remote = pulled.snapshot
  if (!pulled.full && known && missingWithoutTombstone(dev.local, known, remote, pulled.tombstoned).length > 0) {
    dev.refetches++
    pulled = await pullRemote(db.client, 'u1', dev.pull, { full: true, nowMs: dev.clockMs })
    if ('error' in pulled) throw new Error(pulled.error)
    remote = pulled.snapshot
  }
  const { merged, deletes } = known ? mergeSnapshots(dev.local, remote, known) : { merged: mergeWithoutBaseline(dev.local, remote), deletes: noDeletes }
  await beforePush?.()
  const res = await pushListsTasksHabits(db.client, 'u1', merged.lists, merged.tasks, merged.habits, merged.sections, deletes, remote)
  if (res.error) throw new Error(res.error)
  const stamped = withServerStamps(merged, res.written)
  dev.local = stamped
  dev.baseline = { ...baselineFrom(syncedSnapshot(stamped, remote, [...res.rejected, ...res.stale])), clockOffsetMs: res.clockOffsetMs ?? known?.clockOffsetMs }
  afterPush(dev.pull, stamped, deletes, res)
  return res
}

const edit = (dev: Device, id: string, patch: Partial<Task>) => {
  dev.local = { ...dev.local, tasks: dev.local.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date(dev.clockMs).toISOString() } : t)) }
}
const addTask = (dev: Device, id: string) => {
  const base = dev.local.tasks[0]!
  dev.local = { ...dev.local, tasks: [...dev.local.tasks, { ...base, id, title: id, updatedAt: new Date(dev.clockMs).toISOString() }] }
}
const removeTask = (dev: Device, id: string) => {
  dev.local = { ...dev.local, tasks: dev.local.tasks.filter((t) => t.id !== id) }
}
const titles = (s: SyncSnapshot) => Object.fromEntries(s.tasks.map((t) => [t.id, t.title]))
const serverTitles = (db: ReturnType<typeof fakeDb>) => Object.fromEntries(db.tables.tasks!.map((r) => [r.id, r.title]))

/** 2 台がそれぞれ 1 回同期した状態（サーバーには a・b・c） */
async function setup(opts: Parameters<typeof fakeDb>[0] & { offsetUnknown?: boolean } = {}) {
  const db = fakeDb(opts)
  db.tables.lists!.push({ ...inboxRow })
  db.tables.tasks!.push(taskRow('a'), taskRow('b'), taskRow('c'))
  const phone = newDevice(db)
  const pc = newDevice(db)
  await syncDevice(db, phone)
  await syncDevice(db, pc)
  // どちらの端末も、前に送った行でサーバーの時計とのずれを測ってある（ずれ 0）
  if (!opts.offsetUnknown) {
    for (const d of [phone, pc]) d.baseline = { ...d.baseline!, clockOffsetMs: 0 }
    tick(db, [phone, pc], 1000)
    await syncDevice(db, phone)
    await syncDevice(db, pc)
  }
  for (const d of [phone, pc]) Object.assign(d, { fullPulls: 0, deltaPulls: 0, refetches: 0 })
  db.resetDownloaded()
  return { db, phone, pc }
}

/** 時間を進める（サーバーと両方の端末の時計） */
const tick = (db: ReturnType<typeof fakeDb>, devs: Device[], ms: number) => {
  db.advance(ms)
  for (const d of devs) d.clockMs += ms
}

describe('差分の取得 (#194)', () => {
  it('最初は全部を取り、次からは変わった行だけを取る', async () => {
    const db = fakeDb()
    db.tables.tasks!.push(taskRow('a'))
    const solo = newDevice(db)
    await syncDevice(db, solo)
    expect([solo.fullPulls, solo.deltaPulls]).toEqual([1, 0])
    tick(db, [solo], 60_000)
    await syncDevice(db, solo)
    expect([solo.fullPulls, solo.deltaPulls]).toEqual([1, 1])
  })

  it('何も変わっていなければ差分は 1 行も取らない', async () => {
    const { db, phone, pc } = await setup()
    tick(db, [phone, pc], 60_000)
    await syncDevice(db, phone)
    expect(phone.deltaPulls).toBe(1)
    // 何も変わっていなければ 1 行も取らない（前回の目印より 5 分前から取るが、行の時刻はもっと前）
    expect(db.downloaded.tasks ?? 0).toBe(0)
    expect(titles(phone.local)).toEqual({ a: 'a', b: 'b', c: 'c' })
  })

  it('サーバーの時計とのずれが分からない端末は、最後に変わった行を取り直すが、何も消さない', async () => {
    const { db, phone, pc } = await setup({ offsetUnknown: true })
    tick(db, [phone, pc], 60 * 60_000)
    await syncDevice(db, phone)
    expect(phone.deltaPulls).toBe(1)
    // 目印は見た行の時刻まで（a・b・c は同じ時刻）
    expect(db.downloaded.tasks).toBe(3)
    expect(titles(phone.local)).toEqual({ a: 'a', b: 'b', c: 'c' })
  })

  it('差分が空でも手元の行を消さない', async () => {
    const { db, phone, pc } = await setup()
    for (let i = 0; i < 3; i++) {
      tick(db, [phone, pc], 60_000)
      await syncDevice(db, phone)
    }
    expect(phone.deltaPulls).toBe(3)
    expect(phone.refetches).toBe(0)
    expect(titles(phone.local)).toEqual({ a: 'a', b: 'b', c: 'c' })
    expect(serverTitles(db)).toEqual({ a: 'a', b: 'b', c: 'c' })
  })

  it('ほかの端末で足した・変えた・消した行が届く（取るのは変わった行と印だけ）', async () => {
    const { db, phone, pc } = await setup()
    tick(db, [phone, pc], 60_000)
    addTask(pc, 'd')
    edit(pc, 'a', { title: 'A from pc' })
    removeTask(pc, 'b')
    await syncDevice(db, pc)
    db.resetDownloaded()
    tick(db, [phone, pc], 60_000)
    await syncDevice(db, phone)
    expect(phone.deltaPulls).toBe(1)
    expect(phone.refetches).toBe(0)
    expect(titles(phone.local)).toEqual({ a: 'A from pc', c: 'c', d: 'd' })
    // 取ったのは変わった 2 行と印 1 つだけ（c は取らない）
    expect(db.downloaded.tasks).toBe(2)
    expect(db.downloaded.sync_tombstones).toBe(1)
    expect(serverTitles(db)).toEqual({ a: 'A from pc', c: 'c', d: 'd' })
  })

  it('消した行が同じ id でまた作られたら（元に戻す）、印は消え、行が届く', async () => {
    const { db, phone, pc } = await setup()
    const b = pc.local.tasks.find((t) => t.id === 'b')!
    tick(db, [phone, pc], 60_000)
    removeTask(pc, 'b')
    await syncDevice(db, pc)
    // スマホは消えたのを一度受け取る
    tick(db, [phone, pc], 60_000)
    await syncDevice(db, phone)
    expect(titles(phone.local)).toEqual({ a: 'a', c: 'c' })
    // PC で元に戻す（同じ id で作り直す）
    tick(db, [phone, pc], 60_000)
    pc.local = { ...pc.local, tasks: [...pc.local.tasks, { ...b, title: 'b restored', updatedAt: new Date(pc.clockMs).toISOString() }] }
    await syncDevice(db, pc)
    expect(db.tables.sync_tombstones!.filter((t) => t.row_id === 'b')).toEqual([])
    tick(db, [phone, pc], 60_000)
    await syncDevice(db, phone)
    expect(titles(phone.local)).toEqual({ a: 'a', c: 'c', b: 'b restored' })
  })

  it('消してすぐ作り直したのを 1 回の差分で受け取っても、行が残る', async () => {
    const { db, phone, pc } = await setup()
    const b = pc.local.tasks.find((t) => t.id === 'b')!
    tick(db, [phone, pc], 60_000)
    removeTask(pc, 'b')
    await syncDevice(db, pc)
    pc.local = { ...pc.local, tasks: [...pc.local.tasks, { ...b, title: 'b again' }] }
    await syncDevice(db, pc)
    tick(db, [phone, pc], 60_000)
    await syncDevice(db, phone)
    expect(titles(phone.local)).toEqual({ a: 'a', b: 'b again', c: 'c' })
  })

  it('さかのぼって取り直した分が重なっても、同じ行が 2 つにならず、送り直さない', async () => {
    const { db, phone, pc } = await setup()
    edit(pc, 'a', { title: 'A1' })
    await syncDevice(db, pc)
    // 5 分以内に 3 回同期する（毎回同じ行がさかのぼりの範囲に入る）
    for (let i = 0; i < 3; i++) {
      tick(db, [phone, pc], 30_000)
      const res = await syncDevice(db, phone)
      expect(res.written).toEqual([])
    }
    expect(db.downloaded.tasks).toBeGreaterThanOrEqual(3)
    expect(phone.local.tasks.filter((t) => t.id === 'a')).toHaveLength(1)
    expect(titles(phone.local).a).toBe('A1')
  })

  it('この端末で消した行は、送った後の差分で戻らない', async () => {
    const { db, phone, pc } = await setup()
    tick(db, [phone, pc], 60_000)
    removeTask(phone, 'c')
    await syncDevice(db, phone)
    for (let i = 0; i < 2; i++) {
      tick(db, [phone, pc], 60_000)
      await syncDevice(db, phone)
    }
    expect(titles(phone.local)).toEqual({ a: 'a', b: 'b' })
    expect(serverTitles(db)).toEqual({ a: 'a', b: 'b' })
  })

  it('同じ時刻の行がページの境目をまたいでも全部取る（1 つの文で書いた行は同じ時刻）', async () => {
    const { db, phone, pc } = await setup({ maxRows: 100 })
    tick(db, [phone, pc], 60_000)
    for (let i = 0; i < 1234; i++) addTask(pc, `n${String(i).padStart(4, '0')}`)
    await syncDevice(db, pc)
    tick(db, [phone, pc], 60_000)
    await syncDevice(db, phone)
    expect(phone.deltaPulls).toBe(1)
    expect(phone.local.tasks).toHaveLength(3 + 1234)
    expect(new Set(phone.local.tasks.map((t) => t.id)).size).toBe(3 + 1234)
  })

  it('前の版のアプリが端末の時計（遅れている）で書いた行は、差分で取りこぼしても 6 時間ごとの全部の取得で届く', async () => {
    const { db, phone, pc } = await setup()
    tick(db, [phone, pc], 60 * 60_000)
    await syncDevice(db, phone)
    // 時計が 1 時間遅れた前の版のアプリが足す
    db.oldClientWrite('tasks', taskRow('old', { updated_at: new Date(db.serverNowMs() - 60 * 60_000).toISOString() }))
    tick(db, [phone, pc], 60_000)
    await syncDevice(db, phone)
    expect(titles(phone.local).old).toBeUndefined()
    tick(db, [phone, pc], FULL_FETCH_INTERVAL_MS)
    await syncDevice(db, phone)
    expect(phone.fullPulls).toBe(1)
    expect(titles(phone.local).old).toBe('old')
  })

  it('差分で取りこぼして前回同期した行がサーバーの内容に無いときは、消さずに全部を取り直す', async () => {
    const { db, phone, pc } = await setup()
    tick(db, [phone, pc], 60_000)
    // 何かの理由で前回の内容から b が抜けた（取りこぼし）。差分には印も行も来ない
    phone.pull.mirror = { ...phone.pull.mirror!, tasks: phone.pull.mirror!.tasks.filter((t) => t.id !== 'b') }
    await syncDevice(db, phone)
    expect(phone.refetches).toBe(1)
    expect(titles(phone.local)).toEqual({ a: 'a', b: 'b', c: 'c' })
    expect(serverTitles(db)).toEqual({ a: 'a', b: 'b', c: 'c' })
  })

  it('取得した後に他の端末が変えて断られたら、次は全部を取る', async () => {
    const { db, phone, pc } = await setup()
    tick(db, [phone, pc], 60_000)
    edit(phone, 'a', { title: 'phone' })
    edit(pc, 'a', { completed: true })
    const res = await syncDevice(db, phone, async () => {
      await syncDevice(db, pc)
    })
    expect(res.stale).toEqual([{ table: 'tasks', id: 'a', op: 'upsert' }])
    const fullBefore = phone.fullPulls
    await syncDevice(db, phone)
    expect(phone.fullPulls).toBe(fullBefore + 1)
    expect(db.tables.tasks!.find((r) => r.id === 'a')).toMatchObject({ title: 'phone', completed: true })
  })

  it('端末の時計が進んで目印が先へ行きすぎても、次に送った行の時刻で気づいて全部を取り直す', async () => {
    const { db, phone, pc } = await setup()
    phone.clockMs += 60 * 60_000 // 時計が 1 時間進んだ（控えのずれは 0 のまま）
    await syncDevice(db, phone)
    tick(db, [phone, pc], 60_000)
    edit(pc, 'a', { title: 'A from pc' })
    await syncDevice(db, pc)
    tick(db, [phone, pc], 60_000)
    await syncDevice(db, phone)
    // 目印がサーバーの時刻より先なので、差分では届かない（消えもしない）
    expect(titles(phone.local)).toEqual({ a: 'a', b: 'b', c: 'c' })
    edit(phone, 'b', { title: 'B from phone' })
    await syncDevice(db, phone)
    expect(phone.pull.forceFull).toBe(true)
    await syncDevice(db, phone)
    expect(titles(phone.local)).toEqual({ a: 'A from pc', b: 'B from phone', c: 'c' })
    expect(serverTitles(db)).toEqual({ a: 'A from pc', b: 'B from phone', c: 'c' })
  })

  it('`008` を流す前の DB（印の表が無い）では、毎回全部を取って前と同じに動く', async () => {
    const { db, phone, pc } = await setup({ noTombstones: true })
    tick(db, [phone, pc], 60_000)
    removeTask(pc, 'b')
    await syncDevice(db, pc)
    tick(db, [phone, pc], 60_000)
    await syncDevice(db, phone)
    await syncDevice(db, phone)
    expect(phone.pull.deltaUnsupported).toBe(true)
    expect(phone.deltaPulls).toBe(0)
    expect(titles(phone.local)).toEqual({ a: 'a', c: 'c' })
  })
})

describe('needsFullFetch', () => {
  const ready = (): PullState => ({ ...createPullState(), mirror: emptySnap(), cursor: '2026-10-03T00:00:00.000000+00:00', lastFullAt: 1_000_000, lastPullAt: 1_000_000 })
  it('前回の内容と目印があり、6 時間たっていなければ差分', () => {
    expect(needsFullFetch(ready(), 1_000_000 + 60_000)).toBe(false)
  })
  it('前回の内容・目印が無い、取り直しの指示、差分を取れない DB、6 時間たった、時計が戻ったときは全部', () => {
    expect(needsFullFetch(createPullState(), 0)).toBe(true)
    expect(needsFullFetch({ ...ready(), cursor: null }, 1_000_001)).toBe(true)
    expect(needsFullFetch({ ...ready(), forceFull: true }, 1_000_001)).toBe(true)
    expect(needsFullFetch({ ...ready(), deltaUnsupported: true }, 1_000_001)).toBe(true)
    expect(needsFullFetch(ready(), 1_000_000 + FULL_FETCH_INTERVAL_MS)).toBe(true)
    expect(needsFullFetch(ready(), 999_999)).toBe(true)
  })
})

describe('advanceCursor', () => {
  const now = Date.parse('2026-10-03T00:00:00Z')
  it('見た時刻のうち一番新しいもの（前の目印より戻さない）', () => {
    expect(advanceCursor(null, ['2026-10-02T00:00:00.000001+00:00', '2026-10-02T00:00:00.000002+00:00'], now)).toBe('2026-10-02T00:00:00.000002+00:00')
    expect(advanceCursor('2026-10-02T12:00:00.000000+00:00', ['2026-10-02T00:00:00.000002+00:00'], now)).toBe('2026-10-02T12:00:00.000000+00:00')
  })
  it('サーバーの時計でいまより先の時刻（時計が進んだ前の版のアプリの行）は使わない', () => {
    expect(advanceCursor(null, ['2099-01-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z'], now)).toBe('2026-10-02T00:00:00.000Z')
    expect(advanceCursor(null, ['2099-01-01T00:00:00.000Z'], now)).toBeNull()
  })
  it('次の差分は目印より 5 分前から取る', () => {
    expect(DELTA_OVERLAP_MS).toBe(5 * 60_000)
  })
})

describe('applyChanges', () => {
  const t = (id: string, title = id) => ({ id, title }) as unknown as Task
  const changes = (patch: Partial<SyncChanges>): SyncChanges => ({ lists: [], sections: [], tasks: [], habits: [], tombstones: [], ...patch })
  it('変わった行は置き換え、新しい行は足し、印のある行は外す。何度当てても同じ', () => {
    const mirror = { ...emptySnap(), tasks: [t('a'), t('b')] }
    const c = changes({ tasks: [t('a', 'A'), t('n')], tombstones: [{ table: 'tasks', id: 'b', deletedAt: 'x' }] })
    const once = applyChanges(mirror, c)
    expect(once.tasks.map((x) => [x.id, x.title])).toEqual([['a', 'A'], ['n', 'n']])
    expect(applyChanges(once, c)).toEqual(once)
  })
  it('差分に無い行は残す（無い＝消えた、ではない）', () => {
    const mirror = { ...emptySnap(), tasks: [t('a'), t('b')] }
    expect(applyChanges(mirror, changes({}))).toEqual(mirror)
  })
  it('同じ差分に行と印があれば印を優先する（印は行より後に取っている）', () => {
    const out = applyChanges({ ...emptySnap(), tasks: [t('a')] }, changes({ tasks: [t('a', 'A')], tombstones: [{ table: 'tasks', id: 'a', deletedAt: 'x' }] }))
    expect(out.tasks).toEqual([])
  })
  it('印は表ごと（同じ id の別の表の行は消さない）', () => {
    const mirror = { ...emptySnap(), tasks: [t('x')], habits: [{ id: 'x' } as never] }
    const out = applyChanges(mirror, changes({ tombstones: [{ table: 'habits', id: 'x', deletedAt: 'x' }] }))
    expect(out.tasks.map((x) => x.id)).toEqual(['x'])
    expect(out.habits).toEqual([])
  })
})

describe('missingWithoutTombstone', () => {
  const t = (id: string) => ({ id }) as unknown as Task
  const base = { lists: {}, sections: {}, habits: {}, tasks: { a: 1, b: 1 } }
  it('前回同期した行がサーバーの内容に無く、印も無ければ知らせる', () => {
    expect(missingWithoutTombstone({ ...emptySnap(), tasks: [t('a'), t('b'), t('new')] }, base, { ...emptySnap(), tasks: [t('a')] }, new Set())).toEqual(['tasks:b'])
  })
  it('印が届いた行・まだ送っていない新しい行は知らせない', () => {
    expect(missingWithoutTombstone({ ...emptySnap(), tasks: [t('a'), t('b'), t('new')] }, base, { ...emptySnap(), tasks: [t('a')] }, new Set(['tasks:b']))).toEqual([])
  })
})
