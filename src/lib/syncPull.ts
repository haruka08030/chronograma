import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchChangesSince,
  fetchListsTasksHabits,
  fetchServerNow,
  fetchSyncRound,
  type SyncChanges,
  type SyncPushResult,
  type SyncRound,
  type SyncTable,
} from './supabaseData'
import type { SyncDeletes, SyncSnapshot } from './syncMerge'
import { PULL_STATE_KEY_PREFIX, readStored, writeStored, storedKeys } from './dataStore'
import { SYNC_PROTOCOL_VERSION } from './syncVersion'
import { appVersionForSync } from './versionSeen'

/**
 * サーバーの内容の取得。毎回 4 つの表を全部取る代わりに、前回の取得より後に変わった行と消えた行の印
 * （`008` の sync_tombstones）だけを取り、手元に持っている「前回取得したサーバーの内容」（`mirror`）に当てて、
 * いまのサーバーの内容を作る。三方向マージ（`syncMerge.ts`）にはこれまでと同じく、サーバーの内容が全部そろったものを渡す。
 *
 * 差分では「取得に無い」は「消えた」ではない（変わっていないだけ）。消えたと分かるのは印があるときだけ。
 * `mirror` と目印は保存の置き場所（IndexedDB）にも残し（`savePullState`）、開き直したときも差分で取る（#258）。
 * 残すときはアプリの版と持ち主を付け、版が違えば（行の読み方が変わったかもしれない）・持ち主が違えば使わない。
 * 時刻はすべてサーバーの時計（`008` の `sync_server_now()`）で決める。端末の時計とずれの見積もりは使わない。
 * 1 回の取得は `035` の `sync_changes_since`（差分・印・設定の版・版の下限・1 日の気分を 1 往復で）。関数が無い DB では前の取り方
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
 * 同じ行を何度当てても同じ（さかのぼって取り直した分が重なってもよい）。印は行より後に取っているので、印のほうを優先する。
 * さかのぼって取り直しただけの行（`updated_at` が前回の内容と同じ）は置き換えない。何も変わらなければ同じ配列のまま
 * （置き換えると、同じ中身でも別のオブジェクトになり、比べ直し・前回の内容の書き直しが 5 分のあいだ毎回起きていた、#258）
 */
export function applyChanges(mirror: SyncSnapshot, changes: SyncChanges): SyncSnapshot {
  const out: SyncSnapshot = { ...mirror }
  for (const kind of ['lists', 'sections', 'tasks', 'habits'] as const) {
    const changed = changes[kind] as { id: string; updatedAt?: string }[]
    const gone = new Set(changes.tombstones.filter((t) => KIND_OF[t.table] === kind).map((t) => t.id))
    if (changed.length === 0 && gone.size === 0) continue
    const byId = new Map((mirror[kind] as { id: string; updatedAt?: string }[]).map((x) => [x.id, x]))
    let touched = false
    for (const x of changed) {
      const old = byId.get(x.id)
      if (old && old.updatedAt !== undefined && old.updatedAt === x.updatedAt && !gone.has(x.id)) continue
      byId.set(x.id, x)
      touched = true
    }
    for (const id of gone) if (byId.delete(id)) touched = true
    if (touched) out[kind] = [...byId.values()] as never
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

/** 全部を取るときに `sync_changes_since` に渡す目印（行は返らず、時刻・版・設定の版だけが返る） */
const NOTHING_SINCE = 'infinity'

export type PullResult = {
  snapshot: SyncSnapshot
  full: boolean
  tombstoned: ReadonlySet<string>
  /** `sync_changes_since` の答え（版の下限・設定の版・1 日の気分）。関数が無い DB では無い */
  round?: SyncRound
}

/**
 * いまのサーバーの内容を取る。全部を取るか差分かは `needsFullFetch`（と `full`）で決める。
 * サーバーの時刻を次の目印にする（その時刻より前に確定した行は、この取得で見えている。
 * 前後して確定する行は、次の取得でさかのぼる 5 分で拾う）。
 * ふだんは `sync_changes_since` の 1 往復（時刻と差分を同じ時点で読む）。全部を取るときは時刻を先に取ってからページに分けて取る。
 * サーバーの時刻・差分・印が取れなければ失敗として返す（全部を取る道へは逃げない）。`state` は取れたときだけ書き換える。
 * `moodSince` は 1 日の気分の差分の目印（`dayMoodSince`）。渡すと同じ 1 往復で取る
 */
export async function pullRemote(
  supabase: SupabaseClient,
  userId: string,
  state: PullState,
  opts: { full?: boolean; moodSince?: string | null } = {},
): Promise<PullResult | { error: string }> {
  const wantDelta = !opts.full && !!state.mirror && state.cursor !== null && !state.forceFull
  const since = wantDelta ? new Date(Date.parse(state.cursor!) - DELTA_OVERLAP_MS).toISOString() : NOTHING_SINCE
  const round = await fetchSyncRound(supabase, since, opts.moodSince ?? null)
  if ('error' in round) return { error: round.error }
  if ('missing' in round) return pullRemoteSeparately(supabase, userId, state, opts)
  const startedAt = round.now
  const startedMs = Date.parse(startedAt)
  const mirror = state.mirror
  const mirrorHasRows = !!mirror && mirror.lists.length + mirror.sections.length + mirror.tasks.length + mirror.habits.length > 0
  // 前に取った内容があるのにサーバーに行が 1 つも無い（アカウントごと消された・全部消えた）: 全部を取って確かめる
  if (wantDelta && !needsFullFetch(state, startedMs) && (round.hasRows || !mirrorHasRows)) {
    let changes = round.changes
    // 1 回の上限を超えた: 同じ目印からページに分けて取る（目印は答えの時刻のまま）
    if (!changes) {
      const paged = await fetchChangesSince(supabase, userId, since)
      if ('error' in paged) return { error: paged.error }
      changes = paged
    }
    if (!changes.tombstonesTrimmed) return applyDelta(state, changes, startedAt, round)
  }
  return pullAll(supabase, userId, state, startedAt, round)
}

function applyDelta(state: PullState, changes: SyncChanges, startedAt: string, round?: SyncRound): PullResult {
  state.mirror = applyChanges(state.mirror!, changes)
  state.cursor = startedAt
  state.lastPullAt = Date.parse(startedAt)
  return {
    snapshot: state.mirror,
    full: false,
    tombstoned: new Set(changes.tombstones.map((t) => `${KIND_OF[t.table]}:${t.id}`)),
    ...(round ? { round } : {}),
  }
}

async function pullAll(
  supabase: SupabaseClient,
  userId: string,
  state: PullState,
  startedAt: string,
  round?: SyncRound,
): Promise<PullResult | { error: string }> {
  const all = await fetchListsTasksHabits(supabase, userId)
  if ('error' in all) return all
  const startedMs = Date.parse(startedAt)
  state.mirror = all
  state.cursor = startedAt
  state.lastFullAt = startedMs
  state.lastPullAt = startedMs
  state.forceFull = false
  return { snapshot: all, full: true, tombstoned: new Set(), ...(round ? { round } : {}) }
}

/** `035` を流す前の DB: サーバーの時刻 → 差分（4 表・印・上限で消した印）を 1 つずつ取る */
async function pullRemoteSeparately(
  supabase: SupabaseClient,
  userId: string,
  state: PullState,
  opts: { full?: boolean },
): Promise<PullResult | { error: string }> {
  const now = await fetchServerNow(supabase)
  if ('error' in now) return { error: now.error }
  const startedAt = now.at
  if (!opts.full && !needsFullFetch(state, Date.parse(startedAt))) {
    const since = new Date(Date.parse(state.cursor!) - DELTA_OVERLAP_MS).toISOString()
    const changes = await fetchChangesSince(supabase, userId, since)
    if ('error' in changes) return { error: changes.error }
    if (!changes.tombstonesTrimmed) return applyDelta(state, changes, startedAt)
  }
  return pullAll(supabase, userId, state, startedAt)
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
    // 中身の同じ行（別のオブジェクト）も手元の行に替える（次からは同じオブジェクトとして比べない）
    state.mirror = applyPushToMirror(state.mirror, pushed, [...res.written, ...(res.unchanged ?? [])], {
      lists: kept('lists'),
      sections: kept('sections'),
      tasks: kept('tasks'),
      habits: kept('habits'),
    })
  }
  if (res.stale.length > 0) state.forceFull = true
}

/** 前回取得したサーバーの内容と目印の置き場所（利用者ごと、`PULL_STATE_KEY_PREFIX`）。中身は保存の置き場所（IndexedDB）に */
const pullStateKey = (userId: string) => `${PULL_STATE_KEY_PREFIX}${userId}`
/** 行の読み方（`rowToTask` など）が変わるかもしれないので、アプリの版ごと。版が違えば使わずに全部を取る */
const pullStateTag = () => `${SYNC_PROTOCOL_VERSION}|${appVersionForSync()}`

interface StoredPullState {
  tag: string
  owner: string
  mirror: SyncSnapshot
  cursor: string
  lastFullAt: number
  lastPullAt: number
}

/** 最後に書いた内容（同じ内容なら書き直さない。前回の内容は変わらなければ同じ配列のまま） */
let savedPull: { key: string; raw: string; mirror: SyncSnapshot; lastFullAt: number } | null = null

/**
 * 前回取得したサーバーの内容と目印を残す（開き直したときに差分で取る、#258）。
 * 前回の内容が変わっていなければ（同じ配列）書かない。目印だけ進んだときも書かない（さかのぼって取るだけで、取りこぼさない）。
 * ただし全部を取り直した時刻は残す（6 時間ごとの全部の取得を、開き直すたびにやり直さない）
 */
export function savePullState(userId: string, state: PullState): void {
  if (!state.mirror || state.cursor === null || state.forceFull) return
  const key = pullStateKey(userId)
  const m = state.mirror
  const prev = savedPull
  if (
    prev &&
    prev.key === key &&
    prev.lastFullAt === state.lastFullAt &&
    prev.mirror.lists === m.lists &&
    prev.mirror.sections === m.sections &&
    prev.mirror.tasks === m.tasks &&
    prev.mirror.habits === m.habits &&
    readSafe(key) === prev.raw
  )
    return
  const stored: StoredPullState = {
    tag: pullStateTag(),
    owner: userId,
    mirror: m,
    cursor: state.cursor,
    lastFullAt: state.lastFullAt,
    lastPullAt: state.lastPullAt,
  }
  try {
    const raw = JSON.stringify(stored)
    writeStored(key, raw, { onError: () => clearPullState(userId) })
    savedPull = { key, raw, mirror: m, lastFullAt: state.lastFullAt }
  } catch {
    // 書けなければ（容量）、古い内容を残さない。次に開いたときは全部を取る
    clearPullState(userId)
  }
}

/**
 * 残した内容から始める。この人の・この版のアプリが残したものだけ。読めなければ全部を取る状態のまま。
 * 目印は残したときの時刻なので、何日も閉じていれば `needsFullFetch` が全部を取らせる（30 日で消える印を取りこぼさない）
 */
export function loadPullState(userId: string): PullState {
  const state = createPullState()
  try {
    const raw = readStored(pullStateKey(userId))
    if (!raw) return state
    const s = JSON.parse(raw) as Partial<StoredPullState>
    if (s.tag !== pullStateTag() || s.owner !== userId || typeof s.cursor !== 'string' || !s.mirror) return state
    const m = s.mirror
    if (![m.lists, m.sections, m.tasks, m.habits].every(Array.isArray)) return state
    state.mirror = { lists: m.lists, sections: m.sections, tasks: m.tasks, habits: m.habits }
    state.cursor = s.cursor
    state.lastFullAt = Number(s.lastFullAt) || 0
    state.lastPullAt = Number(s.lastPullAt) || 0
    savedPull = { key: pullStateKey(userId), raw, mirror: state.mirror, lastFullAt: state.lastFullAt }
  } catch {
    /* 読めなければ全部を取る */
  }
  return state
}

function readSafe(key: string): string | null {
  try {
    return readStored(key)
  } catch {
    return null
  }
}

/** 残した内容を消す（`userId` を渡さなければ誰の分も。アカウントの削除・書けなかったとき。ログアウトでは `clearSignedOutLeftovers`） */
export function clearPullState(userId?: string): boolean {
  let cleared = false
  try {
    for (const key of storedKeys()) {
      if (!key.startsWith(PULL_STATE_KEY_PREFIX) || (userId !== undefined && key !== pullStateKey(userId))) continue
      writeStored(key, null)
      cleared = true
    }
  } catch {
    /* 消せなければそのまま（持ち主と版を確かめてから使う） */
  }
  if (userId === undefined || savedPull?.key === pullStateKey(userId)) savedPull = null
  return cleared
}
