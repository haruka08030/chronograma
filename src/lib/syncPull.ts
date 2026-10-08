import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchChangesSince,
  fetchListsTasksHabits,
  fetchServerNow,
  type SyncChanges,
  type SyncPushResult,
  type SyncTable,
} from './supabaseData'
import type { SyncDeletes, SyncSnapshot } from './syncMerge'

/**
 * サーバーの内容の取得。毎回 4 つの表を全部取る代わりに、前回の取得より後に変わった行と消えた行の印
 * （`008` の sync_tombstones）だけを取り、手元に持っている「前回取得したサーバーの内容」（`mirror`）に当てて、
 * いまのサーバーの内容を作る。三方向マージ（`syncMerge.ts`）にはこれまでと同じく、サーバーの内容が全部そろったものを渡す。
 *
 * 差分では「取得に無い」は「消えた」ではない（変わっていないだけ）。消えたと分かるのは印があるときだけ。
 * `mirror` はメモリだけに持つ（タブごと・ログインごと）。開いたとき・ログインしたときは全部を取る。
 * 時刻はすべてサーバーの時計（`008` の `sync_server_now()`）で決める。端末の時計とずれの見積もりは使わない
 */

/** 前回の取得の目印から、どれだけ前までさかのぼって取り直すか。now() はトランザクションの開始時刻なので、確定の順と前後する */
export const DELTA_OVERLAP_MS = 5 * 60_000
/**
 * これだけ経ったら全部を取り直す（差分で取りこぼしたものの安全網。端末の時計で updated_at を書く前の版のアプリの書き込みも拾う）。
 * 印（sync_tombstones）はこれより長く残す必要がある（消すなら 30 日より古いもの）
 */
export const FULL_FETCH_INTERVAL_MS = 6 * 60 * 60_000
/**
 * 印を残しておく期間（`010` の pg_cron が毎日これより古い印を消す）。前回の取得がこれより前なら全部を取り直す
 * （差分はさらに `DELTA_OVERLAP_MS` さかのぼるので、その分も含めて残っている間だけ差分）。
 * 1 人の印が上限（`010`、50,000 件）を超えてサーバーが古い印を消したときも、目印より後の分が消えていれば全部を取る（`tombstonesTrimmed`）
 */
export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60_000
export interface PullState {
  /** 前回取得したサーバーの内容（と、その後この端末が送れた行）。まだ無ければ null */
  mirror: SyncSnapshot | null
  /** 前回の取得を始めたときのサーバーの時刻。次はこれより `DELTA_OVERLAP_MS` 前から取る */
  cursor: string | null
  /** 最後に全部を取り始めたときのサーバーの時刻（ms） */
  lastFullAt: number
  /** 最後に取得を始めたときのサーバーの時刻（ms） */
  lastPullAt: number
  /** 次は全部を取る（送った行が断られた・送信が途中で失敗した） */
  forceFull: boolean
}

export function createPullState(): PullState {
  return { mirror: null, cursor: null, lastFullAt: 0, lastPullAt: 0, forceFull: false }
}

/** `serverNowMs` はサーバーの時計 */
export function needsFullFetch(state: PullState, serverNowMs: number): boolean {
  if (!state.mirror || state.cursor === null || state.forceFull) return true
  if (serverNowMs - state.lastFullAt >= FULL_FETCH_INTERVAL_MS) return true
  return serverNowMs - state.lastPullAt + DELTA_OVERLAP_MS >= TOMBSTONE_RETENTION_MS
}

const KIND_OF: Record<SyncTable, keyof SyncSnapshot> = { lists: 'lists', list_sections: 'sections', tasks: 'tasks', habits: 'habits' }

/**
 * 差分を前回の内容に当てる。変わった行は置き換え（無ければ足す）、印のある行は外す。
 * 同じ行を何度当てても同じ（さかのぼって取り直した分が重なってもよい）。印は行より後に取っているので、印のほうを優先する
 */
export function applyChanges(mirror: SyncSnapshot, changes: SyncChanges): SyncSnapshot {
  const out: SyncSnapshot = { ...mirror }
  for (const kind of ['lists', 'sections', 'tasks', 'habits'] as const) {
    const changed = changes[kind] as { id: string }[]
    const gone = new Set(changes.tombstones.filter((t) => KIND_OF[t.table] === kind).map((t) => t.id))
    if (changed.length === 0 && gone.size === 0) continue
    const byId = new Map((mirror[kind] as { id: string }[]).map((x) => [x.id, x]))
    for (const x of changed) byId.set(x.id, x)
    for (const id of gone) byId.delete(id)
    out[kind] = [...byId.values()] as never
  }
  return out
}

/**
 * 送れた行・消せた行を前回の内容に入れる（次の差分を待たずに、サーバーにある内容として扱う）。
 * 差分でも同じ行がまた届くが、端末の時計で updated_at を付ける DB（`004` を流す前）でも、送った行を「サーバーに無い」と読まないように
 */
export function applyPushToMirror(
  mirror: SyncSnapshot,
  pushed: SyncSnapshot,
  written: readonly { table: SyncTable; id: string }[],
  deleted: Partial<Record<keyof SyncSnapshot, readonly string[]>>,
): SyncSnapshot {
  const out: SyncSnapshot = { ...mirror }
  for (const kind of ['lists', 'sections', 'tasks', 'habits'] as const) {
    const ids = new Set(written.filter((w) => KIND_OF[w.table] === kind).map((w) => w.id))
    const gone = new Set(deleted[kind] ?? [])
    if (ids.size === 0 && gone.size === 0) continue
    const byId = new Map((mirror[kind] as { id: string }[]).map((x) => [x.id, x]))
    for (const x of pushed[kind] as { id: string }[]) if (ids.has(x.id)) byId.set(x.id, x)
    for (const id of gone) byId.delete(id)
    out[kind] = [...byId.values()] as never
  }
  return out
}

/**
 * いまのサーバーの内容を取る。全部を取るか差分かは `needsFullFetch`（と `full`）で決める。
 * 最初にサーバーの時刻を取り、それを次の目印にする（その時刻より前に確定した行は、この取得で見えている。
 * 前後して確定する行は、次の取得でさかのぼる 5 分で拾う）。
 * サーバーの時刻・差分・印が取れなければ失敗として返す（全部を取る道へは逃げない）。`state` は取れたときだけ書き換える
 */
export async function pullRemote(
  supabase: SupabaseClient,
  userId: string,
  state: PullState,
  opts: { full?: boolean } = {},
): Promise<{ snapshot: SyncSnapshot; full: boolean; tombstoned: ReadonlySet<string> } | { error: string }> {
  const now = await fetchServerNow(supabase)
  if ('error' in now) return { error: now.error }
  const startedAt = now.at
  const startedMs = Date.parse(startedAt)
  if (!opts.full && !needsFullFetch(state, startedMs)) {
    const since = new Date(Date.parse(state.cursor!) - DELTA_OVERLAP_MS).toISOString()
    const changes = await fetchChangesSince(supabase, userId, since)
    if ('error' in changes) return { error: changes.error }
    if (!changes.tombstonesTrimmed) {
      state.mirror = applyChanges(state.mirror!, changes)
      state.cursor = startedAt
      state.lastPullAt = startedMs
      return { snapshot: state.mirror, full: false, tombstoned: new Set(changes.tombstones.map((t) => `${KIND_OF[t.table]}:${t.id}`)) }
    }
  }
  const all = await fetchListsTasksHabits(supabase, userId)
  if ('error' in all) return all
  state.mirror = all
  state.cursor = startedAt
  state.lastFullAt = startedMs
  state.lastPullAt = startedMs
  state.forceFull = false
  return { snapshot: all, full: true, tombstoned: new Set() }
}

/**
 * 差分で作った内容の確かめ。前回同期した（控えにある）手元の行がサーバーの内容に無いのは、ふつうは
 * この取得で消えた印が届いた行だけ。それ以外に無い行があれば、差分で取りこぼしている（前の版のアプリが端末の時計で書いた行など）。
 * そのまま合わせると「他の端末で消された」と読んで手元から消してしまうので、全部を取り直す。無い行の `kind:id` を返す
 */
export function missingWithoutTombstone(
  local: SyncSnapshot,
  baseline: { [K in keyof SyncSnapshot]: Record<string, number> },
  remote: SyncSnapshot,
  tombstoned: ReadonlySet<string>,
): string[] {
  const out: string[] = []
  for (const kind of ['lists', 'sections', 'tasks', 'habits'] as const) {
    const have = new Set((remote[kind] as { id: string }[]).map((x) => x.id))
    for (const x of local[kind] as { id: string }[]) {
      if (have.has(x.id) || !(x.id in baseline[kind])) continue
      if (!tombstoned.has(`${kind}:${x.id}`)) out.push(`${kind}:${x.id}`)
    }
  }
  return out
}

/**
 * 送信が終わった後: 送れた行・消せた行を前回の内容に入れる。断られた行があれば（取得した後に他の端末が変えていた）、
 * 差分で取りこぼしていないよう次は全部を取る
 */
export function afterPush(state: PullState, pushed: SyncSnapshot, deletes: SyncDeletes, res: SyncPushResult): void {
  if (state.mirror) {
    const notDeleted = new Set([...res.rejected, ...res.stale].filter((r) => r.op === 'delete').map((r) => `${KIND_OF[r.table]}:${r.id}`))
    const kept = (kind: keyof SyncSnapshot) => deletes[kind].filter((id) => !notDeleted.has(`${kind}:${id}`))
    state.mirror = applyPushToMirror(state.mirror, pushed, res.written, {
      lists: kept('lists'),
      sections: kept('sections'),
      tasks: kept('tasks'),
      habits: kept('habits'),
    })
  }
  if (res.stale.length > 0) state.forceFull = true
}
