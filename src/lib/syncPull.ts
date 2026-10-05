import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchChangesSince, fetchListsTasksHabits, type SyncChanges, type SyncPushResult, type SyncTable } from './supabaseData'
import type { SyncDeletes, SyncSnapshot } from './syncMerge'

/**
 * サーバーの内容の取得。毎回 4 つの表を全部取る代わりに、前回の取得より後に変わった行と消えた行の印
 * （`008` の sync_tombstones）だけを取り、手元に持っている「前回取得したサーバーの内容」（`mirror`）に当てて、
 * いまのサーバーの内容を作る。三方向マージ（`syncMerge.ts`）にはこれまでと同じく、サーバーの内容が全部そろったものを渡す。
 *
 * 差分では「取得に無い」は「消えた」ではない（変わっていないだけ）。消えたと分かるのは印があるときだけ。
 * `mirror` はメモリだけに持つ（タブごと・ログインごと）。開いたとき・ログインしたときは全部を取る
 */

/** 前回の取得の目印から、どれだけ前までさかのぼって取り直すか。now() はトランザクションの開始時刻なので、確定の順と前後する */
export const DELTA_OVERLAP_MS = 5 * 60_000
/**
 * これだけ経ったら全部を取り直す（差分で取りこぼしたものの安全網。端末の時計で updated_at を書く前の版のアプリの書き込みも拾う）。
 * 印（sync_tombstones）はこれより長く残す必要がある（消すなら 30 日より古いもの）
 */
export const FULL_FETCH_INTERVAL_MS = 6 * 60 * 60_000
/** 印を残しておく期間（サーバー側で消すならこれより古いもの）。前回の取得がこれより前なら全部を取り直す */
export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60_000
/** 目印には、サーバーの時計でいまより先の時刻を使わない（時計が進んだ前の版のアプリが書いた行で、目印が先へ飛ばないように） */
const FUTURE_SLACK_MS = 60_000
/**
 * サーバーの時計とのずれが分かっているときは、取り始めたときのサーバーの時刻（の見積もり）からこれだけ前まで目印を進める。
 * 何も変わらない間に、最後に変わった行を毎回取り直さないため。見積もりの誤差の分だけ手前にする
 */
const ESTIMATE_SLACK_MS = 60_000

export interface PullState {
  /** 前回取得したサーバーの内容（と、その後この端末が送れた行）。まだ無ければ null */
  mirror: SyncSnapshot | null
  /** 取得した行・印のサーバーの時刻のうち一番新しいもの。次はこれより `DELTA_OVERLAP_MS` 前から取る */
  cursor: string | null
  /** 最後に全部を取った時刻（端末の時計） */
  lastFullAt: number
  /** 最後に取得した時刻（端末の時計） */
  lastPullAt: number
  /** 次は全部を取る（送った行が断られた・送信が途中で失敗した） */
  forceFull: boolean
  /** 差分を取れない DB（`008` を流す前）。このログインの間は毎回全部を取る */
  deltaUnsupported: boolean
}

export function createPullState(): PullState {
  return { mirror: null, cursor: null, lastFullAt: 0, lastPullAt: 0, forceFull: false, deltaUnsupported: false }
}

export function needsFullFetch(state: PullState, nowMs: number): boolean {
  if (!state.mirror || state.cursor === null || state.forceFull || state.deltaUnsupported) return true
  // 端末の時計が戻ったときも取り直す
  if (nowMs < state.lastFullAt || nowMs - state.lastFullAt >= FULL_FETCH_INTERVAL_MS) return true
  return nowMs - state.lastPullAt >= TOMBSTONE_RETENTION_MS
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

/** ISO の時刻をマイクロ秒で（Postgres はマイクロ秒まで返す。Date.parse はミリ秒で切れる） */
export function stampMicros(iso: string): number {
  const m = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d+))?(Z|[+-]\d\d:?\d\d)?$/.exec(iso)
  if (!m) {
    const ms = Date.parse(iso)
    return Number.isFinite(ms) ? ms * 1000 : Number.NaN
  }
  const ms = Date.parse(m[1] + (m[3] ?? 'Z'))
  if (!Number.isFinite(ms)) return Number.NaN
  return ms * 1000 + Number((m[2] ?? '').padEnd(6, '0').slice(0, 6))
}

/**
 * 次の目印。見たサーバーの時刻のうち一番新しいもの（前の目印より戻さない）。
 * サーバーの時計でいまより先の時刻（`estServerNowMs` より先）は使わない
 */
export function advanceCursor(prev: string | null, stamps: readonly string[], estServerNowMs: number): string | null {
  let best = prev
  let bestUs = prev ? stampMicros(prev) : -Infinity
  const limitUs = (estServerNowMs + FUTURE_SLACK_MS) * 1000
  for (const s of stamps) {
    const us = stampMicros(s)
    if (!Number.isFinite(us) || us > limitUs) continue
    if (us > bestUs) {
      best = s
      bestUs = us
    }
  }
  return best
}

function snapshotStamps(s: SyncSnapshot): string[] {
  const out: string[] = []
  for (const kind of ['lists', 'sections', 'tasks', 'habits'] as const) {
    for (const x of s[kind] as { updatedAt?: string | null }[]) if (x.updatedAt) out.push(x.updatedAt)
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
 * 差分を取れない DB なら、その場で全部を取る。`state` は取れたときだけ書き換える
 */
export async function pullRemote(
  supabase: SupabaseClient,
  userId: string,
  state: PullState,
  opts: { full?: boolean; clockOffsetMs?: number; nowMs?: number } = {},
): Promise<{ snapshot: SyncSnapshot; full: boolean; tombstoned: ReadonlySet<string> } | { error: string }> {
  const now = opts.nowMs ?? Date.now()
  const estServerNow = now + (opts.clockOffsetMs ?? 0)
  /** 取り始めたときのサーバーの時刻の見積もり（ずれが分かっているときだけ）。これより前に確定した行は、この取得で見えている */
  const floor = opts.clockOffsetMs === undefined ? [] : [new Date(estServerNow - ESTIMATE_SLACK_MS).toISOString()]
  if (!opts.full && !needsFullFetch(state, now)) {
    const since = new Date(Date.parse(state.cursor!) - DELTA_OVERLAP_MS).toISOString()
    const changes = await fetchChangesSince(supabase, userId, since)
    if ('error' in changes && !changes.unsupported) return { error: changes.error }
    if ('error' in changes) {
      state.deltaUnsupported = true
    } else {
      state.mirror = applyChanges(state.mirror!, changes)
      state.cursor = advanceCursor(state.cursor, [
        ...snapshotStamps({ lists: changes.lists, sections: changes.sections, tasks: changes.tasks, habits: changes.habits }),
        ...changes.tombstones.map((t) => t.deletedAt),
        ...floor,
      ], estServerNow)
      state.lastPullAt = now
      return { snapshot: state.mirror, full: false, tombstoned: new Set(changes.tombstones.map((t) => `${KIND_OF[t.table]}:${t.id}`)) }
    }
  }
  const all = await fetchListsTasksHabits(supabase, userId)
  if ('error' in all) return all
  state.mirror = all
  state.cursor = advanceCursor(null, [...snapshotStamps(all), ...floor], estServerNow)
  state.lastFullAt = now
  state.lastPullAt = now
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
 * 送った行にサーバーが付けた時刻（いまのサーバーの時刻）より目印が先なら、目印が先へ行きすぎている
 * （端末の時計を進めたなどで、ずれの見積もりが外れた）。そのままだと差分で行を取りこぼすので、次は全部を取る
 */
export function checkCursorAgainstServer(state: PullState, serverStamps: readonly string[]): void {
  if (state.cursor === null || serverStamps.length === 0) return
  const cursorUs = stampMicros(state.cursor)
  const nowUs = Math.min(...serverStamps.map(stampMicros).filter(Number.isFinite))
  if (Number.isFinite(nowUs) && cursorUs > nowUs + FUTURE_SLACK_MS * 1000) state.forceFull = true
}

/**
 * 送信が終わった後: 送れた行・消せた行を前回の内容に入れる。断られた行があれば（取得した後に他の端末が変えていた）、
 * 差分で取りこぼしていないよう次は全部を取る。送った行の時刻より目印が先なら、それも全部を取る
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
  checkCursorAgainstServer(state, res.written.map((w) => w.updatedAt))
}
