import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchListsTasksHabits, pushListsTasksHabits } from './supabaseData'
import type { TaskList } from '../types/list'
import type { Task } from '../types/task'
import type { Habit } from '../types/habit'
import { TASK_DEFAULTS } from './taskDefaults'
import {
  baselineFrom,
  mergeSnapshots,
  mergeWithoutBaseline,
  syncedSnapshot,
  withServerStamps,
  type SyncBaseline,
  type SyncSnapshot,
} from './syncMerge'

type Row = { id: string; user_id: string } & Record<string, unknown>

/**
 * PostgREST の最小限の偽物。select は id の keyset（gt・order・limit）、upsert は onConflict を見る。
 * `onPage` は select が 1 ページ返すたびに呼ばれる（取得の途中で他端末が書き換える場面を作る）。エラーを返すとそのページは失敗する。
 * `maxRows` はサーバーの 1 回あたりの上限、`uniqueOn` は DB にある一意制約。
 * 書き込みは `004` のトリガー（sync_write_guard）と同じに振る舞う: base_updated_at を送った行は
 * サーバーの行の updated_at と同じときだけ通し、updated_at をサーバーの時計（`serverNow`）にする。
 * 送らない行は前の動き（updated_at が古ければ捨てる）。`noBaseColumn` は `004` を流す前の DB
 */
function fakeSupabase(
  tables: Record<string, Row[]>,
  opts: {
    maxRows?: number
    uniqueOn?: string
    rejectRow?: (table: string, row: Row) => { code: string; message: string } | null
    noBaseColumn?: boolean
    serverNow?: () => string
    onPage?: (table: string, page: Row[]) => { message: string } | void
  } = {},
) {
  const { maxRows = 1000, uniqueOn = 'user_id,id', rejectRow, noBaseColumn = false } = opts
  let tick = 0
  const serverNow = opts.serverNow ?? (() => `2026-10-03T00:00:00.${String(++tick).padStart(6, '0')}+00:00`)
  const upserts: { table: string; onConflict: string; rows: Row[] }[] = []
  const deletes: { table: string; ids: string[] }[] = []
  const ms = (iso: unknown) => Date.parse(String(iso))
  const write = (table: string, rows: Row[]): Row[] => {
    const all = (tables[table] ??= [])
    const out: Row[] = []
    for (const { base_updated_at: base, ...row } of rows) {
      const i = all.findIndex((r) => r.user_id === row.user_id && r.id === row.id)
      const old = i >= 0 ? all[i] : undefined
      let next: Row
      if (base === undefined) {
        if (old && ms(row.updated_at) < ms(old.updated_at)) continue
        next = { ...old, ...row } as Row
      } else {
        if (old ? base !== old.updated_at : base !== '-infinity') continue
        const now = serverNow()
        const stamp = old && ms(old.updated_at) >= ms(now) ? new Date(ms(old.updated_at) + 1).toISOString() : now
        next = { ...old, ...row, updated_at: stamp } as Row
      }
      if (old) all[i] = next
      else all.push(next)
      out.push(next)
    }
    return out
  }
  const client = {
    from(table: string) {
      const all = () => tables[table] ?? []
      return {
        select: () => {
          let userId = ''
          let after: string | null = null
          const q = {
            eq: (_col: string, v: string) => ((userId = v), q),
            gt: (col: string, v: string) => {
              if (col !== 'id') throw new Error(`fake select: gt on ${col}`)
              return ((after = v), q)
            },
            order: (col: string) => {
              if (col !== 'id') throw new Error(`fake select: order by ${col}`)
              return q
            },
            limit: async (n: number) => {
              const data = all()
                .filter((r) => r.user_id === userId && (after === null || r.id > after))
                .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
                .slice(0, Math.min(n, maxRows))
              const error = opts.onPage?.(table, data)
              return error ? { data: null, error } : { data, error: null }
            },
          }
          return q
        },
        upsert: (rows: Row[], { onConflict }: { onConflict: string }) => ({
          select: async () => {
            if (onConflict !== uniqueOn) {
              return { data: null, error: { message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' } }
            }
            if (noBaseColumn && rows.some((r) => 'base_updated_at' in r)) {
              return {
                data: null,
                error: { code: 'PGRST204', message: `Could not find the 'base_updated_at' column of '${table}' in the schema cache` },
              }
            }
            // Postgres と同じく、1 行でも拒否されたらまとめて落ちる
            const bad = rejectRow && rows.map((r) => rejectRow(table, r)).find(Boolean)
            if (bad) return { data: null, error: bad }
            upserts.push({ table, onConflict, rows })
            return { data: write(table, rows).map((r) => ({ id: r.id, updated_at: r.updated_at })), error: null }
          },
        }),
        delete: () => {
          let userId = ''
          const remove = (match: (r: Row) => boolean) => {
            const gone = all().filter((r) => r.user_id === userId && match(r))
            tables[table] = all().filter((r) => !gone.includes(r))
            return gone
          }
          const q = {
            eq: (_col: string, v: string) => ((userId = v), q),
            in: async (_col: string, ids: string[]) => {
              deletes.push({ table, ids })
              remove((r) => ids.includes(r.id))
              return { error: null }
            },
            or: (filter: string) => {
              const pairs = [...filter.matchAll(/and\(id\.eq\."((?:[^"\\]|\\.)*)",updated_at\.eq\."((?:[^"\\]|\\.)*)"\)/g)].map((m) => [
                m[1]!.replace(/\\(.)/g, '$1'),
                m[2]!.replace(/\\(.)/g, '$1'),
              ])
              return {
                select: async () => {
                  deletes.push({ table, ids: pairs.map(([id]) => id!) })
                  const gone = remove((r) => pairs.some(([id, at]) => r.id === id && r.updated_at === at))
                  return { data: gone.map((r) => ({ id: r.id })), error: null }
                },
              }
            },
          }
          return q
        },
      }
    },
  }
  return { client: client as unknown as SupabaseClient, upserts, deletes, tables }
}

const task = (id: string, userId = 'u1'): Row => ({
  id,
  user_id: userId,
  list_id: '__inbox__',
  parent_id: null,
  title: id,
  description: '',
  completed: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  sort_order: 0,
  due_date: null,
  start_time: null,
  end_time: null,
  priority: 'none',
  tags: [],
  recurrence: null,
  is_time_log: false,
})

const noDeletes = { lists: [], tasks: [], habits: [], sections: [] }

describe('fetchListsTasksHabits', () => {
  it('pages past the API row limit instead of stopping at the first page', async () => {
    const tasks = Array.from({ length: 2500 }, (_, i) => task(`t${String(i).padStart(4, '0')}`))
    const { client } = fakeSupabase({ lists: [], list_sections: [], tasks, habits: [] })
    const res = await fetchListsTasksHabits(client, 'u1')
    if ('error' in res) throw new Error(res.error)
    expect(res.tasks).toHaveLength(2500)
    expect(new Set(res.tasks.map((t) => t.id)).size).toBe(2500)
  })

  it('still gets every row when the server caps pages below the page size', async () => {
    const tasks = Array.from({ length: 450 }, (_, i) => task(`t${String(i).padStart(4, '0')}`))
    const { client } = fakeSupabase({ lists: [], list_sections: [], tasks, habits: [] }, { maxRows: 100 })
    const res = await fetchListsTasksHabits(client, 'u1')
    if ('error' in res) throw new Error(res.error)
    expect(res.tasks).toHaveLength(450)
  })

  it('keeps every remaining row when another device deletes an earlier row mid-fetch (#206)', async () => {
    const tasks = Array.from({ length: 250 }, (_, i) => task(`t${String(i).padStart(4, '0')}`))
    const db = { lists: [], list_sections: [], tasks, habits: [] } as Record<string, Row[]>
    let pages = 0
    const { client } = fakeSupabase(db, {
      maxRows: 100,
      // 1 ページ目を返した直後に、そのページの中の行を消す（offset だと後ろの 1 行が飛ぶ）
      onPage: (table) => {
        if (table === 'tasks' && ++pages === 1) db.tasks = db.tasks!.filter((r) => r.id !== 't0010')
      },
    })
    const res = await fetchListsTasksHabits(client, 'u1')
    if ('error' in res) throw new Error(res.error)
    const ids = res.tasks.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    // 消えた行は 1 ページ目で受け取り済み。残りの 249 行はすべて届く
    expect(ids).toHaveLength(250)
    expect(ids).toContain('t0100')
    expect(ids).toContain('t0249')
  })

  it('gets every row exactly once when another device updates rows mid-fetch (#206)', async () => {
    const tasks = Array.from({ length: 250 }, (_, i) => task(`t${String(i).padStart(4, '0')}`))
    const db = { lists: [], list_sections: [], tasks, habits: [] } as Record<string, Row[]>
    let pages = 0
    const { client } = fakeSupabase(db, {
      maxRows: 100,
      // 受け取り済みの行と、まだの行を書き換える（updated_at が進む）
      onPage: (table) => {
        if (table !== 'tasks' || ++pages !== 1) return
        db.tasks = db.tasks!.map((r) =>
          r.id === 't0005' || r.id === 't0200' ? { ...r, title: `${r.id} edited`, updated_at: '2026-10-05T00:00:00.000Z' } : r,
        )
      },
    })
    const res = await fetchListsTasksHabits(client, 'u1')
    if ('error' in res) throw new Error(res.error)
    const ids = res.tasks.map((t) => t.id)
    expect(ids).toHaveLength(250)
    expect(new Set(ids).size).toBe(250)
    expect(res.tasks.find((t) => t.id === 't0200')?.title).toBe('t0200 edited')
  })

  it('fails instead of returning a partial result when a later page errors', async () => {
    const tasks = Array.from({ length: 250 }, (_, i) => task(`t${String(i).padStart(4, '0')}`))
    let pages = 0
    const { client } = fakeSupabase(
      { lists: [], list_sections: [], tasks, habits: [] },
      { maxRows: 100, onPage: (table) => (table === 'tasks' && ++pages === 2 ? { message: 'boom' } : undefined) },
    )
    const res = await fetchListsTasksHabits(client, 'u1')
    expect(res).toEqual({ error: 'tasks: boom' })
  })

  it("returns only the signed-in user's rows", async () => {
    const { client } = fakeSupabase({ lists: [], list_sections: [], tasks: [task('a'), task('b', 'u2')], habits: [] })
    const res = await fetchListsTasksHabits(client, 'u1')
    if ('error' in res) throw new Error(res.error)
    expect(res.tasks.map((t) => t.id)).toEqual(['a'])
  })
})

describe('repeat weekdays (recurrence JSON)', () => {
  it('reads weekdays on weekly repeats, and drops them elsewhere or when invalid', async () => {
    const rows = [
      { ...task('mw'), recurrence: { type: 'weekly', interval: 1, weekdays: [3, 1, 3, 9, 'x'] } },
      { ...task('old'), recurrence: { type: 'weekly', interval: 2 } },
      { ...task('daily'), recurrence: { type: 'daily', interval: 1, weekdays: [1, 2] } },
      { ...task('empty'), recurrence: { type: 'weekly', interval: 1, weekdays: [] } },
    ]
    const { client } = fakeSupabase({ lists: [], list_sections: [], tasks: rows, habits: [] })
    const res = await fetchListsTasksHabits(client, 'u1')
    if ('error' in res) throw new Error(res.error)
    const byId = Object.fromEntries(res.tasks.map((t) => [t.id, t.recurrence]))
    expect(byId.mw).toEqual({ type: 'weekly', interval: 1, weekdays: [1, 3] })
    expect(byId.old).toEqual({ type: 'weekly', interval: 2 })
    expect(byId.daily).toEqual({ type: 'daily', interval: 1 })
    expect(byId.empty).toEqual({ type: 'weekly', interval: 1 })
  })

  it('sends weekdays inside the recurrence column', async () => {
    const { client, upserts } = fakeSupabase({})
    const [t] = fetchedTasks(['mw'])
    const local = [{ ...t!, recurrence: { type: 'weekly' as const, interval: 1, weekdays: [1, 3, 5] } }]
    const res = await pushListsTasksHabits(client, 'u1', [], local, [], [], noDeletes)
    expect(res.error).toBeUndefined()
    expect(upserts.find((u) => u.table === 'tasks')!.rows[0]!.recurrence).toEqual({ type: 'weekly', interval: 1, weekdays: [1, 3, 5] })
  })
})

describe('task kind (is_time_log / is_sleep columns)', () => {
  it('reads the two columns as the kind', async () => {
    const rows = [
      task('todo'),
      { ...task('log'), is_time_log: true },
      { ...task('sleep'), is_time_log: true, is_sleep: true },
      // 睡眠の印だけで記録の印が無い行は To-Do
      { ...task('odd'), is_sleep: true },
    ]
    const { client } = fakeSupabase({ lists: [], list_sections: [], tasks: rows, habits: [] })
    const res = await fetchListsTasksHabits(client, 'u1')
    if ('error' in res) throw new Error(res.error)
    expect(Object.fromEntries(res.tasks.map((t) => [t.id, t.kind]))).toEqual({ todo: 'todo', log: 'log', sleep: 'sleep', odd: 'todo' })
  })

  it('writes the kind as the two columns older apps read', async () => {
    const { client, upserts } = fakeSupabase({})
    const [todo, log, sleep] = fetchedTasks(['todo', 'log', 'sleep'])
    const local: Task[] = [todo!, { ...log!, kind: 'log' }, { ...sleep!, kind: 'sleep' }]
    const res = await pushListsTasksHabits(client, 'u1', [], local, [], [], noDeletes)
    expect(res.error).toBeUndefined()
    const sent = upserts.find((u) => u.table === 'tasks')!.rows.map((r) => [r.id, r.is_time_log, r.is_sleep, 'kind' in r])
    expect(sent).toEqual([
      ['todo', false, false, false],
      ['log', true, false, false],
      ['sleep', true, true, false],
    ])
  })

  it('reads and writes an event (no check) as is_event, which older apps read as a to-do', async () => {
    const { client } = fakeSupabase({
      lists: [],
      list_sections: [],
      tasks: [{ ...task('event'), is_event: true }, { ...task('oldRow') }],
      habits: [],
    })
    const res = await fetchListsTasksHabits(client, 'u1')
    if ('error' in res) throw new Error(res.error)
    expect(Object.fromEntries(res.tasks.map((t) => [t.id, t.kind]))).toEqual({ event: 'event', oldRow: 'todo' })

    const push = fakeSupabase({})
    const [todo, event] = fetchedTasks(['todo', 'event'])
    const sent = await pushListsTasksHabits(push.client, 'u1', [], [todo!, { ...event!, kind: 'event' }], [], [], noDeletes)
    expect(sent.error).toBeUndefined()
    const rows = push.upserts.find((u) => u.table === 'tasks')!.rows.map((r) => [r.id, r.is_time_log, r.is_event])
    expect(rows).toEqual([
      ['todo', false, false],
      ['event', false, true],
    ])
  })
})

describe('pushListsTasksHabits', () => {
  const inbox: TaskList = { id: '__inbox__', name: '未分類', color: '#7986CB', order: 0 }

  it('upserts on (user_id, id) so every user can have their own __inbox__', async () => {
    const { client, upserts } = fakeSupabase({})
    const res = await pushListsTasksHabits(client, 'u2', [inbox], [], [], [], noDeletes)
    expect(res.error).toBeUndefined()
    expect(upserts.map((u) => u.onConflict)).toEqual(['user_id,id'])
    expect(upserts[0].rows[0]).toMatchObject({ id: '__inbox__', user_id: 'u2' })
  })

  it('does not retry on id alone when the (user_id, id) key is missing; it reports the failure', async () => {
    const { client, upserts } = fakeSupabase({}, { uniqueOn: 'id' })
    const res = await pushListsTasksHabits(client, 'u1', [inbox], [], [], [], noDeletes)
    expect(res.error).toMatch(/unique or exclusion constraint/)
    expect(upserts).toEqual([])
  })

  it('deletes only what the merge decided, never rows missing from the local snapshot', async () => {
    const { client, deletes } = fakeSupabase({ tasks: [task('remote-only')] })
    await pushListsTasksHabits(client, 'u1', [inbox], [], [], [], noDeletes)
    expect(deletes).toEqual([])
    await pushListsTasksHabits(client, 'u1', [inbox], [], [], [], { ...noDeletes, tasks: ['gone'] })
    expect(deletes).toEqual([{ table: 'tasks', ids: ['gone'] }])
  })

  it('sends only rows that differ from what the server already has', async () => {
    const { client, upserts } = fakeSupabase({})
    const fetched = await fetchListsTasksHabits(
      fakeSupabase({ lists: [], list_sections: [], tasks: [task('same'), task('edited')], habits: [] }).client,
      'u1',
    )
    if ('error' in fetched) throw new Error(fetched.error)
    const same = fetched.tasks.find((t) => t.id === 'same')!
    const edited = fetched.tasks.find((t) => t.id === 'edited')!
    const local = [same, { ...edited, title: 'changed', updatedAt: new Date().toISOString() }, { ...same, id: 'new' }]
    const remote = { lists: [inbox], tasks: fetched.tasks, habits: [], sections: [] }
    await pushListsTasksHabits(client, 'u1', [inbox], local, [], [], noDeletes, remote)
    expect(upserts.map((u) => [u.table, u.rows.map((r) => r.id)])).toEqual([['tasks', ['edited', 'new']]])
  })

  it('splits large deletes so the request URL stays short', async () => {
    const { client, deletes } = fakeSupabase({})
    const ids = Array.from({ length: 250 }, (_, i) => `t${i}`)
    await pushListsTasksHabits(
      client,
      'u1',
      [],
      [],
      [],
      [],
      { ...noDeletes, tasks: ids },
      { lists: [], tasks: [], habits: [], sections: [] },
    )
    expect(deletes.map((d) => d.ids.length)).toEqual([100, 100, 50])
  })

  it('sends the other rows when the server rejects one, and reports the rejected one', async () => {
    const tooBig = { code: '23514', message: 'violates check constraint "tasks_size_check"' }
    const { client, upserts } = fakeSupabase({}, { rejectRow: (table, r) => (table === 'tasks' && r.id === 't3' ? tooBig : null) })
    const local = fetchedTasks(['t0', 't1', 't2', 't3', 't4', 't5'])
    const res = await pushListsTasksHabits(client, 'u-iso', [inbox], local, [], [], noDeletes)
    expect(res.error).toBeUndefined()
    expect(res.rejected).toEqual([{ table: 'tasks', id: 't3', op: 'upsert', message: tooBig.message }])
    const sent = upserts.filter((u) => u.table === 'tasks').flatMap((u) => u.rows.map((r) => r.id))
    expect(sent.sort()).toEqual(['t0', 't1', 't2', 't4', 't5'])
  })

  it('does not resend a rejected row until it changes', async () => {
    const reject = { code: '22001', message: 'value too long' }
    const { client, upserts } = fakeSupabase({}, { rejectRow: (table, r) => (table === 'tasks' && r.title === 'bad' ? reject : null) })
    const [ok, bad] = fetchedTasks(['ok', 'bad'])
    const local = [ok, { ...bad, title: 'bad' }]
    await pushListsTasksHabits(client, 'u-memo', [inbox], local, [], [], noDeletes)
    upserts.length = 0
    const again = await pushListsTasksHabits(client, 'u-memo', [inbox], local, [], [], noDeletes)
    expect(again.rejected.map((r) => r.id)).toEqual(['bad'])
    expect(upserts.filter((u) => u.table === 'tasks').flatMap((u) => u.rows.map((r) => r.id))).toEqual(['ok'])
    const fixed = await pushListsTasksHabits(client, 'u-memo', [inbox], [ok, { ...bad, title: 'fixed' }], [], [], noDeletes)
    expect(fixed.rejected).toEqual([])
  })

  it('stops instead of isolating when every row fails for the same reason', async () => {
    const { client } = fakeSupabase({}, { rejectRow: () => ({ code: '23514', message: 'nope' }) })
    const local = fetchedTasks(Array.from({ length: 60 }, (_, i) => `t${i}`))
    const res = await pushListsTasksHabits(client, 'u-all', [], local, [], [], noDeletes)
    expect(res.error).toBe('nope')
  })

  it('does not isolate errors that are not about a single row', async () => {
    const { client } = fakeSupabase({}, { rejectRow: () => ({ code: 'PGRST301', message: 'JWT expired' }) })
    const res = await pushListsTasksHabits(client, 'u-jwt', [inbox], [], [], [], noDeletes)
    expect(res.error).toBe('JWT expired')
    expect(res.rejected).toEqual([])
  })
})

/** 行の形からアプリのタスクに戻したもの（push に渡す形） */
function fetchedTasks(ids: string[]): Task[] {
  return ids.map((id) => ({
    ...TASK_DEFAULTS,
    id,
    listId: '__inbox__',
    parentId: null,
    title: id,
    description: '',
    completed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    dueDate: null,
    startTime: null,
    endTime: null,
    priority: 'none',
    tags: [],
    recurrence: null,
    kind: 'todo',
    completedAt: null,
    sectionId: null,
  }))
}

const habitRow = (id: string, patch: Record<string, unknown> = {}): Row => ({
  id,
  user_id: 'u1',
  title: id,
  color: '#33B679',
  time_mode: 'none',
  start_time: null,
  end_time: null,
  frequency: { type: 'daily' },
  completed_dates: ['2026-10-01'],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...patch,
})

describe('habits.archived_at', () => {
  it('reads rows without the column (before 003) as active, and keeps the archive stamp', async () => {
    const { client } = fakeSupabase({
      lists: [],
      list_sections: [],
      tasks: [],
      habits: [habitRow('old'), habitRow('arch', { archived_at: '2026-10-02T00:00:00+00:00' })],
    })
    const res = await fetchListsTasksHabits(client, 'u1')
    if ('error' in res) throw new Error(res.error)
    expect(res.habits.map((h) => [h.id, h.archivedAt])).toEqual([
      ['arch', '2026-10-02T00:00:00+00:00'],
      ['old', null],
    ])
  })

  it('sends archived_at, and fails instead of dropping it when the DB has no column', async () => {
    const h: Habit = {
      id: 'h',
      title: 'h',
      color: '#33B679',
      timeMode: 'none',
      startTime: null,
      endTime: null,
      frequency: { type: 'daily' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      completedDates: [],
      archivedAt: '2026-10-02T00:00:00.000Z',
    }
    const ok = fakeSupabase({})
    await pushListsTasksHabits(ok.client, 'u-arch', [], [], [h], [], noDeletes)
    expect(ok.upserts.find((u) => u.table === 'habits')?.rows[0]).toMatchObject({ archived_at: '2026-10-02T00:00:00.000Z' })

    // 列が無いと言われても、列を落として送り直さない（落とすとアーカイブが黙って外れる）
    const missing = { code: 'PGRST204', message: "Could not find the 'archived_at' column of 'habits' in the schema cache" }
    const old = fakeSupabase({}, { rejectRow: (table, r) => (table === 'habits' && 'archived_at' in r ? missing : null) })
    const res = await pushListsTasksHabits(old.client, 'u-arch-old', [], [], [h], [], noDeletes)
    expect(res.error).toMatch(/archived_at/)
    expect(old.upserts.find((u) => u.table === 'habits')).toBeUndefined()
  })
})

describe('server time and stale writes (#77)', () => {
  const fresh = () => ({ lists: [] as Row[], list_sections: [] as Row[], tasks: [task('a'), task('b')], habits: [] as Row[] })
  const fetchAll = async (client: SupabaseClient) => {
    const res = await fetchListsTasksHabits(client, 'u1')
    if ('error' in res) throw new Error(res.error)
    return res
  }

  it('sends the version it read (or -infinity for a new row) and gets back the server time', async () => {
    const { client, upserts, tables } = fakeSupabase(fresh())
    const remote = await fetchAll(client)
    const a = remote.tasks.find((t) => t.id === 'a')!
    const local = [
      { ...a, title: 'edited', updatedAt: '2026-01-02T00:00:00.000Z' },
      { ...a, id: 'new' },
    ]
    const res = await pushListsTasksHabits(client, 'u1', [], local, [], [], noDeletes, remote)
    const sent = upserts.find((u) => u.table === 'tasks')!.rows
    expect(sent.map((r) => [r.id, r.base_updated_at])).toEqual([
      ['a', '2026-01-01T00:00:00.000Z'],
      ['new', '-infinity'],
    ])
    expect(res.stale).toEqual([])
    expect(res.written.map((w) => w.id)).toEqual(['a', 'new'])
    // サーバーの時刻が入り、base_updated_at は行に残らない
    const stored = tables.tasks!.find((r) => r.id === 'a')!
    expect(stored.updated_at).toBe(res.written[0]!.updatedAt)
    expect(stored.updated_at).not.toBe('2026-01-02T00:00:00.000Z')
    expect('base_updated_at' in stored).toBe(false)
  })

  it('a device with a fast clock does not stamp the row with its own time', async () => {
    const { client, tables } = fakeSupabase(fresh())
    const remote = await fetchAll(client)
    const a = remote.tasks.find((t) => t.id === 'a')!
    await pushListsTasksHabits(
      client,
      'u1',
      [],
      [{ ...a, title: 'future', updatedAt: '2099-01-01T00:00:00.000Z' }],
      [],
      [],
      noDeletes,
      remote,
    )
    expect(tables.tasks!.find((r) => r.id === 'a')!.updated_at).toMatch(/^2026-10-03/)
  })

  it('refuses a write based on a version another device has since changed, and writes the rest', async () => {
    const { client, tables } = fakeSupabase(fresh())
    const remote = await fetchAll(client)
    // 取得の後に、ほかの端末が a を変えた
    const other = await pushListsTasksHabits(client, 'u1', [], [{ ...remote.tasks[0]!, completed: true }], [], [], noDeletes, remote)
    expect(other.stale).toEqual([])
    const local = remote.tasks.map((t) => ({ ...t, title: `${t.id}!` }))
    const res = await pushListsTasksHabits(client, 'u1', [], local, [], [], noDeletes, remote)
    expect(res.error).toBeUndefined()
    expect(res.rejected).toEqual([])
    expect(res.stale).toEqual([{ table: 'tasks', id: 'a', op: 'upsert' }])
    expect(res.written.map((w) => w.id)).toEqual(['b'])
    expect(tables.tasks!.find((r) => r.id === 'a')).toMatchObject({ title: 'a', completed: true })
    expect(tables.tasks!.find((r) => r.id === 'b')).toMatchObject({ title: 'b!' })
  })

  it('refuses a new row when a row with that id appeared on the server meanwhile', async () => {
    const { client, tables } = fakeSupabase({ lists: [], list_sections: [], tasks: [], habits: [] })
    const remote = await fetchAll(client)
    tables.tasks!.push({ ...task('dup'), title: 'theirs' })
    const res = await pushListsTasksHabits(client, 'u1', [], fetchedTasks(['dup']), [], [], noDeletes, remote)
    expect(res.stale).toEqual([{ table: 'tasks', id: 'dup', op: 'upsert' }])
    expect(tables.tasks![0]).toMatchObject({ title: 'theirs' })
  })

  it('measures how far the device clock is from the server', async () => {
    const { client } = fakeSupabase(fresh(), { serverNow: () => new Date(Date.now() + 60_000).toISOString() })
    const remote = await fetchAll(client)
    const res = await pushListsTasksHabits(client, 'u1', [], [{ ...remote.tasks[0]!, title: 'x' }], [], [], noDeletes, remote)
    expect(res.clockOffsetMs).toBeGreaterThan(55_000)
    expect(res.clockOffsetMs).toBeLessThan(65_000)
  })

  it('does not measure the clock from a row whose time was only bumped past a future-dated old version', async () => {
    // 前の版のアプリ（時計が 1 年進んだ）が書いた行。サーバーはその 1 マイクロ秒（偽物では 1 ミリ秒）後にするだけ
    const rows = fresh()
    rows.tasks[0] = task('a')
    rows.tasks[0].updated_at = '2027-10-03T00:00:00.000Z'
    const { client } = fakeSupabase(rows, { serverNow: () => new Date(Date.now()).toISOString() })
    const remote = await fetchAll(client)
    const res = await pushListsTasksHabits(
      client,
      'u1',
      [],
      [{ ...remote.tasks.find((t) => t.id === 'a')!, title: 'x' }],
      [],
      [],
      noDeletes,
      remote,
    )
    expect(res.written.map((w) => w.updatedAt)).toEqual(['2027-10-03T00:00:00.001Z'])
    expect(res.clockOffsetMs).toBeUndefined()
  })

  it('does not resend a row that differs from the server only in updated_at', async () => {
    const { client, upserts } = fakeSupabase(fresh())
    const remote = await fetchAll(client)
    const local = remote.tasks.map((t) => ({ ...t, updatedAt: '2026-05-05T00:00:00.000Z' }))
    await pushListsTasksHabits(client, 'u1', [], local, [], [], noDeletes, remote)
    expect(upserts).toEqual([])
  })

  it('does not drop the version and resend when the server says the base column is missing (#260)', async () => {
    const { client, upserts, tables } = fakeSupabase(fresh(), { noBaseColumn: true })
    const remote = await fetchAll(client)
    const a = remote.tasks.find((t) => t.id === 'a')!
    const res = await pushListsTasksHabits(
      client,
      'u1',
      [],
      [{ ...a, title: 'edited', updatedAt: '2026-01-02T00:00:00.000Z' }],
      [],
      [],
      noDeletes,
      remote,
    )
    expect(res.error).toMatch(/base_updated_at/)
    expect(upserts).toEqual([])
    expect(tables.tasks!.find((r) => r.id === 'a')).toMatchObject({ title: 'a' })
  })

  it('deletes rows it read with their version even when rows it did not read are deleted in the same batch (#260)', async () => {
    const { client, tables, deletes } = fakeSupabase(fresh())
    const remote = await fetchAll(client)
    // 取得の後に他の端末が a を直した
    await pushListsTasksHabits(client, 'u1', [], [{ ...remote.tasks[0]!, title: 'edited elsewhere' }], [], [], noDeletes, remote)
    const res = await pushListsTasksHabits(client, 'u1', [], [], [], [], { ...noDeletes, tasks: ['a', 'b', 'never-fetched'] }, remote)
    expect(res.error).toBeUndefined()
    // a は版が合わないので残る（無条件の削除にまとめない）
    expect(tables.tasks!.map((r) => r.id)).toEqual(['a'])
    expect(res.stale).toEqual([{ table: 'tasks', id: 'a', op: 'delete' }])
    expect(deletes.at(-1)).toEqual({ table: 'tasks', ids: ['never-fetched'] })
  })

  it('an old app (no base) still writes, and still cannot overwrite with an older time', async () => {
    const { client, tables } = fakeSupabase(fresh())
    // 前の版のアプリ = 取得を渡さない書き込み
    await pushListsTasksHabits(
      client,
      'u1',
      [],
      [{ ...fetchedTasks(['a'])[0]!, title: 'old app', updatedAt: '2026-02-01T00:00:00.000Z' }],
      [],
      [],
      noDeletes,
    )
    expect(tables.tasks!.find((r) => r.id === 'a')).toMatchObject({ title: 'old app' })
    await pushListsTasksHabits(
      client,
      'u1',
      [],
      [{ ...fetchedTasks(['a'])[0]!, title: 'older', updatedAt: '2026-01-15T00:00:00.000Z' }],
      [],
      [],
      noDeletes,
    )
    expect(tables.tasks!.find((r) => r.id === 'a')).toMatchObject({ title: 'old app' })
  })

  it('deletes only rows still at the version it read; an edit made meanwhile survives', async () => {
    const { client, tables } = fakeSupabase(fresh())
    const remote = await fetchAll(client)
    await pushListsTasksHabits(client, 'u1', [], [{ ...remote.tasks[0]!, title: 'edited elsewhere' }], [], [], noDeletes, remote)
    const res = await pushListsTasksHabits(client, 'u1', [], [], [], [], { ...noDeletes, tasks: ['a', 'b'] }, remote)
    expect(res.error).toBeUndefined()
    expect(res.stale).toEqual([{ table: 'tasks', id: 'a', op: 'delete' }])
    expect(tables.tasks!.map((r) => r.id)).toEqual(['a'])
  })

  it('quotes ids with characters PostgREST filters treat specially', async () => {
    const odd = 'x,y"(z)\\'
    const { client, tables } = fakeSupabase({ lists: [], list_sections: [], tasks: [task(odd)], habits: [] })
    const remote = await fetchAll(client)
    await pushListsTasksHabits(client, 'u1', [], [], [], [], { ...noDeletes, tasks: [odd] }, remote)
    expect(tables.tasks).toEqual([])
  })
})

describe('two devices editing the same task (#77)', () => {
  type Device = { local: SyncSnapshot; baseline: SyncBaseline | null }
  const emptySnap = (): SyncSnapshot => ({ lists: [], tasks: [], habits: [], sections: [] })

  /** useSupabaseSync の 1 往復と同じ順: 取得 → 三方向マージ → 送信 → サーバーの時刻を入れて控えに */
  async function syncDevice(client: SupabaseClient, dev: Device, beforePush?: () => Promise<void>) {
    const remote = await fetchListsTasksHabits(client, 'u1')
    if ('error' in remote) throw new Error(remote.error)
    const { merged, deletes } = dev.baseline
      ? mergeSnapshots(dev.local, remote, dev.baseline)
      : { merged: mergeWithoutBaseline(dev.local, remote), deletes: noDeletes }
    await beforePush?.()
    const res = await pushListsTasksHabits(client, 'u1', merged.lists, merged.tasks, merged.habits, merged.sections, deletes, remote)
    if (res.error) throw new Error(res.error)
    const stamped = withServerStamps(merged, res.written)
    dev.local = stamped
    dev.baseline = {
      ...baselineFrom(syncedSnapshot(stamped, remote, [...res.rejected, ...res.stale])),
      clockOffsetMs: res.clockOffsetMs ?? dev.baseline?.clockOffsetMs,
    }
    return res
  }
  const edit = (dev: Device, id: string, patch: Partial<Task>, at: string) => {
    dev.local = { ...dev.local, tasks: dev.local.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: at } : t)) }
  }
  const setup = async () => {
    const fake = fakeSupabase({ lists: [], list_sections: [], tasks: [task('t')], habits: [] })
    const phone: Device = { local: emptySnap(), baseline: null }
    const pc: Device = { local: emptySnap(), baseline: null }
    await syncDevice(fake.client, phone)
    await syncDevice(fake.client, pc)
    return { ...fake, phone, pc }
  }
  const stored = (tables: Record<string, Row[]>) => tables.tasks!.find((r) => r.id === 't')!

  it('title on the phone and completed on the PC both survive', async () => {
    const { client, tables, phone, pc } = await setup()
    edit(phone, 't', { title: 'phone title' }, '2026-10-03T00:00:10.000Z')
    edit(pc, 't', { completed: true }, '2026-10-03T00:00:20.000Z')
    await syncDevice(client, phone)
    await syncDevice(client, pc)
    await syncDevice(client, phone)
    expect(stored(tables)).toMatchObject({ title: 'phone title', completed: true })
    expect(phone.local.tasks[0]).toMatchObject({ title: 'phone title', completed: true })
    expect(pc.local.tasks[0]).toMatchObject({ title: 'phone title', completed: true })
  })

  it('tags added on one device and removed on the other both survive (#261)', async () => {
    const { client, tables, phone, pc } = await setup()
    edit(phone, 't', { tags: ['a', 'b'] }, '2026-10-03T00:00:05.000Z')
    await syncDevice(client, phone)
    await syncDevice(client, pc)
    edit(phone, 't', { tags: ['a', 'b', 'c'] }, '2026-10-03T00:00:10.000Z')
    edit(pc, 't', { tags: ['b'] }, '2026-10-03T00:00:20.000Z')
    await syncDevice(client, phone)
    await syncDevice(client, pc)
    await syncDevice(client, phone)
    expect(stored(tables).tags).toEqual(['b', 'c'])
    expect(phone.local.tasks[0]!.tags).toEqual(['b', 'c'])
    expect(pc.local.tasks[0]!.tags).toEqual(['b', 'c'])
  })

  it('memos edited on both devices keep both versions (#261)', async () => {
    const { client, tables, phone, pc } = await setup()
    edit(phone, 't', { description: 'phone note' }, '2026-10-03T00:00:10.000Z')
    edit(pc, 't', { description: 'pc note' }, '2026-10-03T00:00:20.000Z')
    await syncDevice(client, phone)
    await syncDevice(client, pc)
    await syncDevice(client, phone)
    const memo = String(stored(tables).description)
    expect(memo).toContain('phone note')
    expect(memo).toContain('pc note')
    expect(phone.local.tasks[0]!.description).toBe(memo)
  })

  it('a device whose clock is far ahead does not wipe the other device’s field', async () => {
    const { client, tables, phone, pc } = await setup()
    // PC の時計は 1 年進んでいる。スマホの変更は PC より後でも、時刻では古く見える
    edit(pc, 't', { completed: true }, '2027-10-03T00:00:00.000Z')
    await syncDevice(client, pc)
    edit(phone, 't', { title: 'phone title' }, '2026-10-03T00:00:30.000Z')
    await syncDevice(client, phone)
    await syncDevice(client, pc)
    expect(stored(tables)).toMatchObject({ title: 'phone title', completed: true })
    expect(pc.local.tasks[0]).toMatchObject({ title: 'phone title', completed: true })
  })

  it('a row changed between fetch and push is not overwritten; the next round merges both', async () => {
    const { client, tables, phone, pc } = await setup()
    edit(phone, 't', { title: 'phone title' }, '2026-10-03T00:00:10.000Z')
    edit(pc, 't', { completed: true }, '2026-10-03T00:00:20.000Z')
    // スマホが取得した直後に PC が送る
    const res = await syncDevice(client, phone, async () => {
      await syncDevice(client, pc)
    })
    expect(res.stale).toEqual([{ table: 'tasks', id: 't', op: 'upsert' }])
    expect(stored(tables)).toMatchObject({ title: 't', completed: true })
    // 次の同期（useSupabaseSync はすぐ取り直す）で両方が残る
    await syncDevice(client, phone)
    expect(stored(tables)).toMatchObject({ title: 'phone title', completed: true })
    await syncDevice(client, pc)
    expect(pc.local.tasks[0]).toMatchObject({ title: 'phone title', completed: true })
  })

  it('the same field changed on both: the later edit in server time wins, not the faster clock', async () => {
    const { client, tables, phone, pc } = await setup()
    // PC の時計は 1 時間進んでいる（控えにはサーバーとのずれ −1 時間）
    pc.baseline = { ...pc.baseline!, clockOffsetMs: -3_600_000 }
    edit(pc, 't', { title: 'pc (earlier)' }, '2026-10-03T00:59:59.000Z')
    edit(phone, 't', { title: 'phone (later)' }, '2026-10-03T00:00:00.500Z')
    await syncDevice(client, phone)
    await syncDevice(client, pc)
    expect(stored(tables)).toMatchObject({ title: 'phone (later)' })
  })

  it('a task deleted on one device and edited on the other (after the delete was read) is kept', async () => {
    const { client, tables, phone, pc } = await setup()
    phone.local = { ...phone.local, tasks: [] }
    edit(pc, 't', { title: 'edited' }, '2026-10-03T00:00:10.000Z')
    // スマホが取得した直後に PC が編集を送る → スマホの削除は断られる
    const res = await syncDevice(client, phone, async () => {
      await syncDevice(client, pc)
    })
    expect(res.stale).toEqual([{ table: 'tasks', id: 't', op: 'delete' }])
    await syncDevice(client, phone)
    expect(stored(tables)).toMatchObject({ title: 'edited' })
    expect(phone.local.tasks.map((t) => t.title)).toEqual(['edited'])
  })
})
