import type { SupabaseClient } from '@supabase/supabase-js'

export type Row = Record<string, unknown> & { user_id: string }

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
 * 消すと `008` の印、同じ id が入り直すと印を消す。
 * 利用者ごとに 1 行の設定（`user_settings`・`user_extra_time_zones`・`user_active_timer`）は `007` の settings_write_guard。
 * `missing` に入れた表・関数は読めない（PostgREST の表の一覧が古いときと同じ断り方）
 */
export function fakeDb(opts: { maxRows?: number } = {}) {
  const maxRows = opts.maxRows ?? 1000
  const missing = new Set<string>()
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
  /** 利用者ごとに 1 行の設定（`007` の settings_write_guard。base が無い行の挿入は on conflict do nothing） */
  const writeSetting = (table: string, body: Row, ignoreDuplicates: boolean): Row[] => {
    const all = (tables[table] ??= [])
    const stamp = now()
    const { base_updated_at: base, ...row } = body
    const i = all.findIndex((r) => r.user_id === row.user_id)
    const old = i >= 0 ? all[i] : undefined
    if (!old) {
      const next = { ...row, ...(base == null ? {} : { updated_at: stamp }) } as Row
      all.push(next)
      return [next]
    }
    if (ignoreDuplicates) return []
    let next: Row
    if (base == null) {
      if (micros(row.updated_at) < micros(old.updated_at)) return []
      next = { ...old, ...row } as Row
    } else {
      if (base !== old.updated_at) return []
      const at = micros(old.updated_at) >= micros(stamp) ? fromMicros(micros(old.updated_at) + 1) : stamp
      next = { ...old, ...row, updated_at: at } as Row
    }
    all[i] = next
    return [next]
  }
  /** 取得の記録（`since` は updated_at などの時刻より後だけを取った = 差分） */
  const selects: { table: string; since: boolean }[] = []
  const remove = (table: string, match: (r: Row) => boolean) => {
    const at = now()
    const gone = (tables[table] ?? []).filter(match)
    tables[table] = (tables[table] ?? []).filter((r) => !gone.includes(r))
    for (const r of gone) tombstone(r.user_id, table, String(r.id), at)
    return gone
  }
  /**
   * Supabase Auth の偽物。`user` はログイン中の人、`deleted` は消されたアカウント（`deleteUser`）。
   * 消された人の書き込みは auth.users への外部キーで断られ（23503）、`getUser` は「ユーザーがいない」を返す
   */
  const auth = { user: null as string | null, deleted: new Set<string>(), signOuts: 0 }
  const fkError = (table: string) => ({
    code: '23503',
    message: `insert or update on table "${table}" violates foreign key constraint "${table}_user_id_fkey"`,
  })
  /** 送信（upsert）を受ける直前に呼ぶ。テストで「取得した後に他の端末が変えた」を挟む */
  const hooks: { beforeUpsert?: (table: string) => void } = {}
  const client = {
    auth: {
      getUser: async () => {
        if (auth.user && auth.deleted.has(auth.user)) {
          return {
            data: { user: null },
            error: { name: 'AuthApiError', status: 403, code: 'user_not_found', message: 'User from sub claim in JWT does not exist' },
          }
        }
        if (auth.user) return { data: { user: { id: auth.user } }, error: null }
        return { data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' } }
      },
      signOut: async () => {
        auth.user = null
        auth.signOuts++
        return { error: null }
      },
    },
    /** `008` の sync_server_now() */
    rpc: async (name: string) => {
      if (name !== 'sync_server_now' || missing.has(name)) {
        return {
          data: null,
          error: { code: 'PGRST202', message: `Could not find the function public.${name} without parameters in the schema cache` },
        }
      }
      return { data: fromMicros(clock), error: null }
    },
    from(table: string) {
      return {
        select: (_cols: string, o?: { count?: string }) => {
          const filters: ((r: Row) => boolean)[] = []
          const orders: string[] = []
          let since = false
          /** 続きのページ（最後に受け取った行より後） */
          let next = false
          const run = async (from: number, to: number) => {
            if (from === 0 && !next) selects.push({ table, since })
            if (missing.has(table)) {
              return {
                data: null,
                count: null,
                error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` },
              }
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
            gt: (c: string, v: unknown) => {
              if (isStamp(c)) since = true
              else next = true
              filters.push((r) => cmp(c, r[c], v) > 0)
              return q
            },
            or: (text: string) => {
              next = true
              filters.push(parseOr(text))
              return q
            },
            order: (c: string) => (orders.push(c), q),
            limit: (n: number) => run(0, n - 1),
            range: (from: number, to: number) => run(from, to),
            maybeSingle: async () => {
              const { data, error } = await run(0, 0)
              return { data: data?.[0] ?? null, error }
            },
          }
          return q
        },
        upsert: (rows: Row[] | Row, o?: { onConflict?: string; ignoreDuplicates?: boolean }) => ({
          select: async () => {
            hooks.beforeUpsert?.(table)
            if ((Array.isArray(rows) ? rows : [rows]).some((r) => auth.deleted.has(r.user_id))) return { data: null, error: fkError(table) }
            if (!Array.isArray(rows)) {
              const done = writeSetting(table, rows, o?.ignoreDuplicates ?? false)
              return { data: done.map((r) => ({ updated_at: r.updated_at })), error: null }
            }
            return { data: write(table, rows).map((r) => ({ id: r.id, updated_at: r.updated_at })), error: null }
          },
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
    selects,
    hooks,
    /** 読めなくする表・関数の名前 */
    missing,
    auth,
    /** 別の端末でアカウントを消す（その人の行は印も含めて全部消える。on delete cascade） */
    deleteUser: (userId: string) => {
      auth.deleted.add(userId)
      for (const t of Object.keys(tables)) tables[t] = tables[t]!.filter((r) => r.user_id !== userId)
    },
    /** 表を全部取った回数（差分ではなく） */
    fullFetches: () => selects.filter((x) => x.table === 'lists' && !x.since).length,
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

/** サーバーのタスクの行（既定は u1 の受信箱） */
export const taskRow = (id: string, patch: Record<string, unknown> = {}): Row => ({
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
/** サーバーの受信箱の行（u1） */
export const inboxRow: Row = {
  id: '__inbox__',
  user_id: 'u1',
  name: 'Inbox',
  color: '#000',
  sort_order: 0,
  kind: 'tasks',
  updated_at: '2026-01-01T00:00:00.000000+00:00',
}
