import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchListsTasksHabits, pushListsTasksHabits } from './supabaseData'
import type { TaskList } from '../types/list'

type Row = { id: string; user_id: string } & Record<string, unknown>

/**
 * PostgREST の最小限の偽物。select は range と count、upsert は onConflict を見る。
 * `maxRows` はサーバーの 1 回あたりの上限、`uniqueOn` は DB にある一意制約
 */
function fakeSupabase(tables: Record<string, Row[]>, opts: { maxRows?: number; uniqueOn?: string } = {}) {
  const { maxRows = 1000, uniqueOn = 'user_id,id' } = opts
  const upserts: { table: string; onConflict: string; rows: Row[] }[] = []
  const deletes: { table: string; ids: string[] }[] = []
  const client = {
    from(table: string) {
      const all = tables[table] ?? []
      return {
        select: () => {
          let userId = ''
          const q = {
            eq: (_col: string, v: string) => ((userId = v), q),
            order: () => q,
            range: async (from: number, to: number) => {
              const mine = all.filter((r) => r.user_id === userId).sort((a, b) => a.id.localeCompare(b.id))
              const data = mine.slice(from, Math.min(to + 1, from + maxRows))
              return { data, count: mine.length, error: null }
            },
          }
          return q
        },
        upsert: async (rows: Row[], { onConflict }: { onConflict: string }) => {
          if (onConflict !== uniqueOn) {
            return { error: { message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' } }
          }
          upserts.push({ table, onConflict, rows })
          return { error: null }
        },
        delete: () => {
          const q = {
            eq: () => q,
            in: async (_col: string, ids: string[]) => {
              deletes.push({ table, ids })
              return { error: null }
            },
          }
          return q
        },
      }
    },
  }
  return { client: client as unknown as SupabaseClient, upserts, deletes }
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

  it("returns only the signed-in user's rows", async () => {
    const { client } = fakeSupabase({ lists: [], list_sections: [], tasks: [task('a'), task('b', 'u2')], habits: [] })
    const res = await fetchListsTasksHabits(client, 'u1')
    if ('error' in res) throw new Error(res.error)
    expect(res.tasks.map((t) => t.id)).toEqual(['a'])
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

  it('falls back to id when migration 012 is not applied yet', async () => {
    const { client, upserts } = fakeSupabase({}, { uniqueOn: 'id' })
    const res = await pushListsTasksHabits(client, 'u1', [inbox], [], [], [], noDeletes)
    expect(res.error).toBeUndefined()
    expect(upserts.every((u) => u.onConflict === 'id')).toBe(true)
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
    const fetched = await fetchListsTasksHabits(fakeSupabase({ lists: [], list_sections: [], tasks: [task('same'), task('edited')], habits: [] }).client, 'u1')
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
    await pushListsTasksHabits(client, 'u1', [], [], [], [], { ...noDeletes, tasks: ids }, { lists: [], tasks: [], habits: [], sections: [] })
    expect(deletes.map((d) => d.ids.length)).toEqual([100, 100, 50])
  })
})
