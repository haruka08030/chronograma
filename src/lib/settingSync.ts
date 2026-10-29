/**
 * 利用者ごとに 1 行の設定（ラベル表 `user_settings`・他のタイムゾーン `user_extra_time_zones`・動いているタイマー `user_active_timer`・
 * よく入れる予定 `user_event_templates`・授業と科目のつながり `user_course_links`・時間割 `user_timetable`）の同期で、
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
import { reportSyncError } from './errorReport'
import { SETTINGS_BASE_KEY_PREFIX, SETTINGS_SYNCED_KEY_PREFIX, readStored, writeStored } from './dataStore'

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

/** ラベル表・他のタイムゾーン・動いているタイマー（`timerSync.ts`）・よく入れる予定（`eventTemplates.ts`）・授業と科目のつながり（`courseLinks.ts`）・時間割（`timetable.ts`）・追加機能（`addons.ts`）・睡眠のタイマー（`sleepTimer.ts`）・やらなかった予定（`skippedEvents.ts`）・Google の予定の自分の時間（`myEventTimes.ts`） */
export type SettingKey =
  'labels' | 'zones' | 'timer' | 'templates' | 'courses' | 'timetable' | 'addons' | 'sleepTimer' | 'skipped' | 'myTimes'

/**
 * 版と中身の控えは本体と同じ置き場所（`dataStore.ts`。IndexedDB なら本体と同じトランザクション）に置く。
 * 別の置き場所だと、サーバーの値に合わせた後に本体だけ書けない・閉じて消えると、古い値なのに版だけ新しくなり、
 * 次の同期で古い値を「手元で変えた」と読んでサーバーに送っていた
 */
const syncedKey = (userId: string) => `${SETTINGS_SYNCED_KEY_PREFIX}${userId}`

function readAll(userId: string): Partial<Record<SettingKey, string>> {
  try {
    const raw = readStored(syncedKey(userId))
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
    writeStored(syncedKey(userId), JSON.stringify({ ...readAll(userId), [key]: at }))
  } catch {
    /* 保存できなければ次回は編集時刻で比べる（前の版と同じ動き）だけ */
  }
}

export function clearSettingSyncedAt(userId: string): void {
  try {
    writeStored(syncedKey(userId), null)
    writeStored(baseKey(userId), null)
  } catch {
    /* ignore */
  }
}

/**
 * 手元の値のもとになったサーバーの版の中身の控え（ラベル表はラベルの id の一覧、#357）。版（`at`）と一緒に持ち、
 * `syncedAt` と同じ版の控えだけを使う。両方の端末で変えたときに、片方で消したものを消したと分かるようにする
 */
const baseKey = (userId: string) => `${SETTINGS_BASE_KEY_PREFIX}${userId}`

function readBases(userId: string): Partial<Record<SettingKey, { at: string; value: unknown }>> {
  try {
    const raw = readStored(baseKey(userId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' ? (parsed as Partial<Record<SettingKey, { at: string; value: unknown }>>) : {}
  } catch {
    return {}
  }
}

/** その版の控え。無い・別の版の控えなら null */
export function loadSettingBase(userId: string, key: SettingKey, at: string | null): unknown {
  if (at === null) return null
  const b = readBases(userId)[key]
  return b && b.at === at ? b.value : null
}

export function saveSettingBase(userId: string, key: SettingKey, at: string, value: unknown): void {
  try {
    writeStored(baseKey(userId), JSON.stringify({ ...readBases(userId), [key]: { at, value } }))
  } catch {
    /* 保存できなければ控えの無いとき（前の版と同じ合わせ方）になるだけ */
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
  /** `base` は `syncedAt` の版の中身の控え（`baseOf` で作ったもの。無ければ null） */
  /**
   * `conflicts` は中身ごとに合わせたとき、両方が別の値に変えて新しいほうにした数（`settingMerge.ts`）。
   * 返さない設定は、両方の端末で変えて新しいほうに丸ごと任せたら 1 回と数える
   */
  plan: (
    remote: R | null,
    syncedAt: string | null,
    clockOffsetMs: number,
    base: unknown,
  ) => { apply?: A; push?: P; adopt?: string; conflicts?: number }
  /** 合わせた版の中身の控えを作る（サーバーの値か送った値から）。無ければ控えを持たない */
  baseOf?: (synced: R | P) => unknown
  /** 手元の変えた時刻（`logLabelsUpdatedAt` など） */
  localUpdatedAt: () => string | null
  applyLocal: (apply: A) => void
  setLocalUpdatedAt: (at: string) => void
  push: (p: P) => Promise<SettingPushResult>
  /** 送ったものがサーバーに通ったあと（断られた・失敗したときは呼ばない）。通ったときだけしてよいこと（記録を足すなど）に使う */
  onPushed?: (p: P) => void
  /** 時刻のほかに、手元に送るものが残っていないか（取り込みで足したラベルなど）。無ければ常に true */
  idle?: () => boolean
  /** サーバーに行が無く、手元で一度も変えていなければ何もしない設定か（時間割は既定の値を送らない） */
  emptyWhenUnset?: boolean
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
  opts: {
    isCancelled?: () => boolean
    clockOffsetMs?: number
    maxStaleRetries?: number
    /**
     * 同じ同期の 1 往復（`sync_changes_since`）で分かったサーバーの版（行が無ければ null、分からなければ undefined）。
     * 手元のもとにした版と同じで、手元でも変えていなければ取りに行かない（#258。何も変わらない同期で設定ごとに 1 往復していた）
     */
    remoteVersion?: string | null
    /**
     * 片方の編集を捨てた回数を記録に送る（`noteMergeConflicts`。キーは `settings.<設定の名前>`）。
     * 記録の部分を設定の同期から読み込まない（読み込み順が回り、テストの差し替えが効かなくなる）ので、呼ぶ側から渡す
     */
    onConflicts?: (counts: Record<string, number>) => void
  } = {},
): Promise<void> {
  const cancelled = opts.isCancelled ?? (() => false)
  const retries = opts.maxStaleRetries ?? 3
  if (opts.remoteVersion != null) {
    const syncedAt = loadSettingSyncedAt(userId, s.key)
    if (syncedAt === opts.remoteVersion && s.localUpdatedAt() === syncedAt && (s.idle?.() ?? true)) return
  }
  if (opts.remoteVersion === null && s.emptyWhenUnset && s.localUpdatedAt() === null) return
  for (let attempt = 0; attempt <= retries; attempt++) {
    const remote = await s.fetch()
    if (cancelled()) return
    if (remote && 'error' in remote) {
      console.error(`[sync] ${s.key}`, remote.error)
      reportSyncError(`settings:${s.key}`, remote.error)
      return
    }
    const plannedAt = s.localUpdatedAt()
    const syncedAt = loadSettingSyncedAt(userId, s.key)
    const plan = s.plan(remote, syncedAt, opts.clockOffsetMs ?? 0, s.baseOf ? loadSettingBase(userId, s.key, syncedAt) : null)
    // 片方の編集を捨てた回数を記録に（行の項目と同じ記録。表の名前だけで数え、中身は送らない）
    const conflicts =
      plan.conflicts ??
      (remote &&
      plannedAt !== null &&
      syncedAt !== null &&
      plannedAt !== syncedAt &&
      remote.updatedAt !== syncedAt &&
      (plan.apply || plan.push)
        ? 1
        : 0)
    if (conflicts > 0) opts.onConflicts?.({ [`settings.${s.key}`]: conflicts })
    /** この版に合わせた。版と中身の控えを覚える */
    const synced = (at: string, value: R | P) => {
      saveSettingSyncedAt(userId, s.key, at)
      if (s.baseOf) saveSettingBase(userId, s.key, at, s.baseOf(value))
    }
    if (plan.apply) {
      s.applyLocal(plan.apply)
      if (remote && plan.apply.updatedAt === remote.updatedAt) synced(remote.updatedAt, remote)
    }
    if (plan.adopt) {
      // 合わせている間に手元で変えていなければ、時刻をサーバーの版にそろえる
      if (s.localUpdatedAt() === plannedAt) s.setLocalUpdatedAt(plan.adopt)
      if (remote) synced(plan.adopt, remote)
      else saveSettingSyncedAt(userId, s.key, plan.adopt)
    }
    if (!plan.push) return
    const pushedAt = s.localUpdatedAt()
    const res = await s.push(plan.push)
    if (cancelled()) return
    if ('error' in res) {
      console.error(`[sync] ${s.key}`, res.error)
      reportSyncError(`settings:${s.key}`, res.error)
      return
    }
    if ('stale' in res) continue
    // 送っている間に手元で変えていたら、手元の時刻はそのまま（次の同期でこの版をもとに送る）
    if (s.localUpdatedAt() === pushedAt) s.setLocalUpdatedAt(res.updatedAt)
    synced(res.updatedAt, plan.push)
    s.onPushed?.(plan.push)
    return
  }
  // 取り直しても毎回断られた
  reportSyncError(`settings:${s.key}`, `still stale after ${retries} retries`)
}
