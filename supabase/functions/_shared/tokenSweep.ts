import { keyId, resealWith, secretContext, type KeyRing } from './secretBox.ts'

/**
 * 連携のトークンの列のうち、今の鍵で閉じた `enc:v2:<今の鍵の名前>:` でない値（平文・前の鍵・前の形）を今の鍵で閉じ直す。
 * 使われている連携は読んだついでに閉じ直る（各関数の `needsReseal`）。しばらく使われない連携の行もここで閉じ直し、
 * 鍵を替えたあと前の鍵を外せるようにする。`daily-reminders` の回の終わりに少しずつ流す。
 *
 * - 書き直すのは、読んだときの値のままの行だけ（同時に連携をつなぎ直した新しい値を古い値で上書きしない）
 * - 開けない行（鍵が足りない・壊れた値）は数えて飛ばす（表・列だけをログに出す。中身は出さない）
 */

type Row = Record<string, string | null>

export type SweepTarget = {
  table: string
  /** 行を決める列（主キー） */
  key: readonly string[]
  columns: readonly { column: string; context: (row: Row) => string }[]
}

export const TOKEN_TARGETS: readonly SweepTarget[] = [
  {
    table: 'google_oauth',
    key: ['user_id'],
    columns: [{ column: 'refresh_token', context: (r) => secretContext.google(r.user_id ?? '') }],
  },
  {
    table: 'notion_connection',
    key: ['user_id'],
    columns: [{ column: 'token', context: (r) => secretContext.notion(r.user_id ?? '') }],
  },
  {
    table: 'canvas_connection',
    key: ['user_id', 'id'],
    columns: [
      { column: 'token', context: (r) => secretContext.canvasToken(r.user_id ?? '', r.id ?? '') },
      { column: 'feed_url', context: (r) => secretContext.canvasFeed(r.user_id ?? '', r.id ?? '') },
    ],
  },
]

/** DB の読み書き（Edge Function では supabase-js、テストでは手で作る） */
export type SweepDb = {
  /** `columns` のどれかが null でなく `prefix` で始まらない行を、`key` の順に `limit` 行まで（`key` と `columns` の列を返す） */
  stale(table: string, key: readonly string[], columns: readonly string[], prefix: string, limit: number): Promise<Row[]>
  /** `match`（主キーと読んだときの値）に合う行だけ `patch` で書き直す */
  update(table: string, match: Row, patch: Record<string, string>): Promise<void>
}

export type SweepResult = { resealed: number; unreadable: number }

/** 1 つの表から `limit` 行まで閉じ直す。今の鍵が無ければ何もしない */
export async function resealStaleTokens(
  db: SweepDb,
  keys: KeyRing,
  limit = 100,
  targets: readonly SweepTarget[] = TOKEN_TARGETS,
): Promise<SweepResult> {
  const result: SweepResult = { resealed: 0, unreadable: 0 }
  if (!keys.current) return result
  const prefix = `enc:v2:${await keyId(keys.current)}:`
  for (const target of targets) {
    const rows = await db.stale(
      target.table,
      target.key,
      target.columns.map((c) => c.column),
      prefix,
      limit,
    )
    for (const row of rows) {
      const match: Row = Object.fromEntries(target.key.map((k) => [k, row[k]]))
      const patch: Record<string, string> = {}
      for (const { column, context } of target.columns) {
        const stored = row[column]
        if (!stored || stored.startsWith(prefix)) continue
        try {
          patch[column] = await resealWith(keys, stored, context(row))
          match[column] = stored
        } catch {
          result.unreadable++
          console.warn('[token-sweep] could not open', `${target.table}.${column}`)
        }
      }
      if (Object.keys(patch).length === 0) continue
      await db.update(target.table, match, patch)
      result.resealed++
    }
  }
  return result
}
