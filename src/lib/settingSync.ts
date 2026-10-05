/**
 * 利用者ごとに 1 行の設定（ラベル表 `user_settings`・他のタイムゾーン `user_extra_time_zones`）の同期で、
 * どちらに合わせるかを決める共通の部分。
 *
 * サーバーの `updated_at` はサーバーの時計で付く（`007`）。端末の時計どうしを比べないように、
 * 手元は 2 つの時刻を持つ:
 * - `updatedAt`: 手元で最後に変えた時刻（端末の時計）。同期で合わせたらサーバーの時刻にする
 * - `syncedAt`: 手元の値のもとになったサーバーの版（サーバーの `updated_at` の文字列そのまま）。この端末・この利用者ごとに覚える
 *
 * `updatedAt !== syncedAt` なら、前回合わせた後に手元で変えている。
 * サーバーの版が `syncedAt` と違えば、ほかの端末が変えている。両方のときだけ編集時刻を比べる
 * （手元の時刻はサーバーの時計に直す。前回同期で測ったずれ `clockOffsetMs`）
 */

export type SettingSyncStep =
  /** サーバーに行が無い・手元が新しい: 送る（`base` はサーバーの版、行が無ければ null） */
  | { kind: 'push'; base: string | null }
  /** サーバーに合わせる */
  | { kind: 'apply' }
  /** 中身は同じ。時刻だけサーバーの版にそろえる */
  | { kind: 'adopt' }
  /** この端末でまだ一度も合わせていない（手元の変えた時刻が無い）。両方を合わせる */
  | { kind: 'initial' }
  | { kind: 'none' }

export function settingSyncStep(
  local: { updatedAt: string | null; syncedAt: string | null },
  remote: { updatedAt: string } | null,
  /** 手元とサーバーの中身が同じか */
  same: boolean,
  clockOffsetMs = 0,
): SettingSyncStep {
  if (!remote) return { kind: 'push', base: null }
  if (local.updatedAt === null) return { kind: 'initial' }
  const base = remote.updatedAt
  if (local.syncedAt !== null) {
    const remoteChanged = remote.updatedAt !== local.syncedAt
    const dirty = local.updatedAt !== local.syncedAt
    if (!dirty) {
      if (!remoteChanged) return { kind: 'none' }
      return same ? { kind: 'adopt' } : { kind: 'apply' }
    }
    if (!remoteChanged) return same ? { kind: 'adopt' } : { kind: 'push', base }
  }
  // 両方で変えた（またはこの端末でもとにした版が分からない）: 中身が同じならそろえるだけ、違えば新しいほう
  if (same) return { kind: 'adopt' }
  const lt = Date.parse(local.updatedAt)
  const rt = Date.parse(remote.updatedAt)
  if (Number.isFinite(lt) && (!Number.isFinite(rt) || lt + clockOffsetMs > rt)) return { kind: 'push', base }
  return { kind: 'apply' }
}

export type SettingKey = 'labels' | 'zones'

const syncedKey = (userId: string) => `chronograma-settings-sync-v1:${userId}`

function readAll(userId: string): Partial<Record<SettingKey, string>> {
  try {
    const raw = localStorage.getItem(syncedKey(userId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' ? (parsed as Partial<Record<SettingKey, string>>) : {}
  } catch {
    return {}
  }
}

/** 手元の値のもとになったサーバーの版。まだ無ければ null */
export function loadSettingSyncedAt(userId: string, key: SettingKey): string | null {
  const v = readAll(userId)[key]
  return typeof v === 'string' ? v : null
}

export function saveSettingSyncedAt(userId: string, key: SettingKey, at: string): void {
  try {
    localStorage.setItem(syncedKey(userId), JSON.stringify({ ...readAll(userId), [key]: at }))
  } catch {
    /* 保存できなければ次回は編集時刻で比べる（前の版と同じ動き）だけ */
  }
}

export function clearSettingSyncedAt(userId: string): void {
  try {
    localStorage.removeItem(syncedKey(userId))
  } catch {
    /* ignore */
  }
}

/**
 * 利用者ごとに 1 行の設定を送った結果。`updatedAt` はサーバーが付けた版（`007` を流す前の DB では送った値のまま）。
 * `stale` は取得した後に他の端末が変えていて、サーバーが断った（エラーではない。取り直して合わせ直す）
 */
export type SettingPushResult = { updatedAt: string } | { stale: true } | { error: string }

export interface SettingSyncDeps<
  R extends { updatedAt: string },
  A extends { updatedAt: string },
  P extends { updatedAt: string; base: string | null },
> {
  key: SettingKey
  fetch: () => Promise<R | null | { error: string }>
  plan: (remote: R | null, syncedAt: string | null, clockOffsetMs: number) => { apply?: A; push?: P; adopt?: string }
  /** 手元の変えた時刻（`logLabelsUpdatedAt` など） */
  localUpdatedAt: () => string | null
  applyLocal: (apply: A) => void
  setLocalUpdatedAt: (at: string) => void
  push: (p: P) => Promise<SettingPushResult>
}

/**
 * 利用者ごとに 1 行の設定を 1 回合わせる。失敗してもタスクの同期は止めない（ログに出し、次の同期でまた合わせる）。
 * 送った後に他の端末が先に変えていたら（サーバーが断った）、取り直して合わせ直す（`maxStaleRetries` 回まで）
 */
export async function runSettingSync<
  R extends { updatedAt: string },
  A extends { updatedAt: string },
  P extends { updatedAt: string; base: string | null },
>(
  userId: string,
  s: SettingSyncDeps<R, A, P>,
  opts: { isCancelled?: () => boolean; clockOffsetMs?: number; maxStaleRetries?: number } = {},
): Promise<void> {
  const cancelled = opts.isCancelled ?? (() => false)
  const retries = opts.maxStaleRetries ?? 3
  for (let attempt = 0; attempt <= retries; attempt++) {
    const remote = await s.fetch()
    if (cancelled()) return
    if (remote && 'error' in remote) {
      console.error(`[sync] ${s.key}`, remote.error)
      return
    }
    const plannedAt = s.localUpdatedAt()
    const plan = s.plan(remote, loadSettingSyncedAt(userId, s.key), opts.clockOffsetMs ?? 0)
    if (plan.apply) {
      s.applyLocal(plan.apply)
      if (remote && plan.apply.updatedAt === remote.updatedAt) saveSettingSyncedAt(userId, s.key, remote.updatedAt)
    }
    if (plan.adopt) {
      // 合わせている間に手元で変えていなければ、時刻をサーバーの版にそろえる
      if (s.localUpdatedAt() === plannedAt) s.setLocalUpdatedAt(plan.adopt)
      saveSettingSyncedAt(userId, s.key, plan.adopt)
    }
    if (!plan.push) return
    const pushedAt = s.localUpdatedAt()
    const res = await s.push(plan.push)
    if (cancelled()) return
    if ('error' in res) {
      console.error(`[sync] ${s.key}`, res.error)
      return
    }
    if ('stale' in res) continue
    // 送っている間に手元で変えていたら、手元の時刻はそのまま（次の同期でこの版をもとに送る）
    if (s.localUpdatedAt() === pushedAt) s.setLocalUpdatedAt(res.updatedAt)
    saveSettingSyncedAt(userId, s.key, res.updatedAt)
    return
  }
}
