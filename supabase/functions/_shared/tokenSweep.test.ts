import { describe, expect, it } from 'vitest'
import { keyId, openWith, sealWith, secretContext } from './secretBox.ts'
import { resealStaleTokens, type SweepDb } from './tokenSweep.ts'

const OLD = 'old-key-material-for-sweep'
const NEW = 'new-key-material-for-sweep'
const ring = { current: NEW, previous: [OLD] }

type Row = Record<string, string | null>

/** 表ごとの行を持つだけの DB。`stale` は本物の問い合わせ（not like 'prefix%'、null は数えない）と同じ条件で絞る */
function fakeDb(tables: Record<string, Row[]>) {
  const updates: { table: string; match: Row; patch: Record<string, string> }[] = []
  const db: SweepDb = {
    async stale(table, key, columns, prefix, limit) {
      return (tables[table] ?? [])
        .filter((r) => columns.some((c) => r[c] != null && !r[c]!.startsWith(prefix)))
        .sort((a, b) => key.map((k) => (a[k] ?? '').localeCompare(b[k] ?? '')).find((x) => x !== 0) ?? 0)
        .slice(0, limit)
        .map((r) => ({ ...r }))
    },
    async update(table, match, patch) {
      updates.push({ table, match, patch })
      for (const r of tables[table] ?? []) {
        if (Object.entries(match).every(([k, v]) => r[k] === v)) Object.assign(r, patch)
      }
    },
  }
  return { db, updates }
}

describe('resealStaleTokens', () => {
  it('平文・前の鍵の値を今の鍵で閉じ直し、今の鍵の値と null の列は触らない', async () => {
    const current = await sealWith(NEW, 'g2', secretContext.google('u2'))
    const feedContext = secretContext.canvasFeed('u1', 'a.instructure.com')
    const tables: Record<string, Row[]> = {
      google_oauth: [
        { user_id: 'u1', refresh_token: await sealWith(OLD, 'g1', secretContext.google('u1')) },
        { user_id: 'u2', refresh_token: current },
      ],
      notion_connection: [{ user_id: 'u1', token: 'plain-notion' }],
      canvas_connection: [
        { user_id: 'u1', id: 'a.instructure.com', token: null, feed_url: await sealWith(OLD, 'https://feed', feedContext) },
      ],
    }
    const { db, updates } = fakeDb(tables)
    expect(await resealStaleTokens(db, ring)).toEqual({ resealed: 3, unreadable: 0 })
    expect(tables.google_oauth[1].refresh_token).toBe(current)
    const prefix = `enc:v2:${await keyId(NEW)}:`
    const onlyNew = { current: NEW, previous: [] }
    expect(tables.google_oauth[0].refresh_token!.startsWith(prefix)).toBe(true)
    expect(await openWith(onlyNew, tables.google_oauth[0].refresh_token!, secretContext.google('u1'))).toBe('g1')
    expect(await openWith(onlyNew, tables.notion_connection[0].token!, secretContext.notion('u1'))).toBe('plain-notion')
    const canvas = tables.canvas_connection[0]
    expect(canvas.token).toBeNull()
    expect(await openWith(onlyNew, canvas.feed_url!, feedContext)).toBe('https://feed')
    // 読んだときの値のままの行だけ書き直す（主キーと前の値で絞る）
    expect(updates.find((u) => u.table === 'notion_connection')?.match).toEqual({ user_id: 'u1', token: 'plain-notion' })
    expect(updates.find((u) => u.table === 'canvas_connection')?.match).toMatchObject({ user_id: 'u1', id: 'a.instructure.com' })
    // もう一度流しても何もしない
    expect(await resealStaleTokens(db, ring)).toEqual({ resealed: 0, unreadable: 0 })
  })

  it('開けない値は数えて飛ばし、ほかの行は続ける', async () => {
    const tables: Record<string, Row[]> = {
      google_oauth: [
        { user_id: 'u1', refresh_token: await sealWith('lost-key', 'x', secretContext.google('u1')) },
        { user_id: 'u2', refresh_token: await sealWith(OLD, 'y', secretContext.google('u2')) },
      ],
    }
    const { db } = fakeDb(tables)
    expect(await resealStaleTokens(db, ring)).toEqual({ resealed: 1, unreadable: 1 })
  })

  it('同時につなぎ直された行（読んだあとで値が変わった）は上書きしない', async () => {
    const tables: Record<string, Row[]> = { notion_connection: [{ user_id: 'u1', token: 'plain-old' }] }
    const { db } = fakeDb(tables)
    const racing: SweepDb = {
      stale: async (...args) => {
        const rows = await db.stale(...args)
        if (args[0] === 'notion_connection') {
          tables.notion_connection[0].token = await sealWith(NEW, 'reconnected', secretContext.notion('u1'))
        }
        return rows
      },
      update: db.update,
    }
    await resealStaleTokens(racing, ring)
    expect(await openWith(ring, tables.notion_connection[0].token!, secretContext.notion('u1'))).toBe('reconnected')
  })

  it('今の鍵が無ければ何もしない', async () => {
    const { db, updates } = fakeDb({ notion_connection: [{ user_id: 'u1', token: 'plain' }] })
    expect(await resealStaleTokens(db, { current: undefined, previous: [OLD] })).toEqual({ resealed: 0, unreadable: 0 })
    expect(updates).toEqual([])
  })

  it('1 回に閉じ直すのは表ごとに limit 行まで', async () => {
    const tables: Record<string, Row[]> = {
      notion_connection: Array.from({ length: 5 }, (_, i) => ({ user_id: `u${i}`, token: `plain-${i}` })),
    }
    const { db } = fakeDb(tables)
    expect((await resealStaleTokens(db, ring, 2)).resealed).toBe(2)
    expect((await resealStaleTokens(db, ring, 2)).resealed).toBe(2)
    expect((await resealStaleTokens(db, ring, 2)).resealed).toBe(1)
  })
})
