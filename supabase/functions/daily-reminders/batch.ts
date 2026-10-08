/**
 * 通知の一斉送信で使う、DB や Web Push に依存しない部品。
 * - 購読・タスクを 1000 行ずつ（PostgREST の上限）キーの順に読み切る
 * - 利用者ごとの処理を決まった数だけ同時に走らせる（1 人の失敗でほかを止めない）
 * - 1 つの購読への送信を並べて送り、成功したものと失効したかをまとめる
 * - 1 回の実行の応答の status を決める
 * - この回で送る時間（前の成功の回から今まで）と、回の終わりに残す記録を決める
 */

/** PostgREST が 1 回に返す行の上限（max_rows の既定） */
export const PAGE_SIZE = 1000

/**
 * キーの順に、前のページの最後のキーより後ろを読み切る（keyset）。offset で読むと、読んでいる間に前の行が消えたとき
 * 1 行飛ばす（#206）。`fetchPage(after, limit)` は `after` より後ろのキーの行をキーの昇順で `limit` 行まで返す
 * （`after` が null なら先頭から）。短いページが返ったら終わり
 */
export async function fetchAllAfter<T, K>(
  fetchPage: (after: K | null, limit: number) => Promise<T[]>,
  keyOf: (row: T) => K,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = []
  let after: K | null = null
  for (;;) {
    const page = await fetchPage(after, pageSize)
    out.push(...page)
    if (page.length < pageSize) return out
    after = keyOf(page[page.length - 1])
  }
}

/** PostgREST の `or=(…)` の中に置く値。区切り（`,` `(` `)` `.` `:`）や引用符を含む id もそのまま比べられるよう、引用符で囲む */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** 2 つの列 (a, b) の並びで (afterA, afterB) より後ろの行の条件（PostgREST の `or` の中身） */
export function afterPairFilter(a: string, b: string, after: readonly [string, string]): string {
  const [x, y] = after.map(quoteFilterValue)
  return `${a}.gt.${x},and(${a}.eq.${x},${b}.gt.${y})`
}

/** `size` 個ずつに分ける（URL の長さを抑えるため、`in` に並べる値を分ける） */
export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * `items` を `worker` で処理する。同時に走らせるのは `limit` 個まで。
 * 1 つが失敗してもほかは続け、結果は `items` と同じ順に返す
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await worker(items[i], i) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane))
  return results
}

/** キーごとにまとめる（出てきた順を保つ） */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const g = groups.get(k)
    if (g) g.push(item)
    else groups.set(k, [item])
  }
  return [...groups.values()]
}

/** Web Push の失効（アプリ削除・権限取り消し）。この購読は消す */
export function isGoneStatus(err: unknown): boolean {
  const status = (err as { statusCode?: number } | null)?.statusCode
  return status === 404 || status === 410
}

export type SendOutcome<J> = {
  /** 送れたもの（`jobs` の順） */
  delivered: J[]
  /** 購読が失効していた */
  gone: boolean
  /** 失効以外の理由で送れなかったもの */
  failed: { job: J; error: unknown }[]
}

/** 1 つの購読への通知を並べて送る。1 通の失敗でほかを止めない */
export async function sendJobs<J>(jobs: readonly J[], send: (job: J) => Promise<unknown>): Promise<SendOutcome<J>> {
  const settled = await Promise.allSettled(jobs.map((job) => send(job)))
  const out: SendOutcome<J> = { delivered: [], gone: false, failed: [] }
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') out.delivered.push(jobs[i])
    else if (isGoneStatus(r.reason)) out.gone = true
    else out.failed.push({ job: jobs[i], error: r.reason })
  })
  return out
}

/** 1 回の実行の応答の status。1 つでも送れなかった・処理に失敗した（`failed`）なら 500（cron の実行の記録で気づけるように） */
export function runStatus(failed: number): number {
  return failed > 0 ? 500 : 200
}

/** 取りこぼした通知を、次の回で何分前の分まで送るか */
export const CATCHUP_MAX_MINUTES = 60
/**
 * 走っている回の目印（`reminder_runs.running_since`）がこれより古ければ、落ちた回の残りとみなして次の回が取り直す。
 * Edge Function の 1 回の実行時間の上限（数分）より長くしておく
 */
export const RUN_CLAIM_STALE_MINUTES = 10

/**
 * この回で送る通知の時間の始まり（ms、この時刻は含まない。終わりは `nowMs` を含む）。
 * 前の成功の回の時刻（`last_ok_at`）から今まで。ただし `CATCHUP_MAX_MINUTES` 分より前には戻らない。
 * 記録が無い・読めないとき（初めての回）は `intervalMinutes` 分前から
 */
export function runWindowStart(lastOkAt: string | null | undefined, nowMs: number, intervalMinutes: number): number {
  const last = lastOkAt ? Date.parse(lastOkAt) : NaN
  if (!Number.isFinite(last)) return nowMs - intervalMinutes * 60_000
  return Math.min(nowMs, Math.max(last, nowMs - CATCHUP_MAX_MINUTES * 60_000))
}

/**
 * 回の終わりに `reminder_runs` へ書く内容。走っている目印は必ず外す。
 * `last_ok_at` を進めるのは全部うまくいった回（`failed` が 0）だけ。失敗があれば進めず、次の回が同じ時間をもう一度見る
 * （送れたものは送った印 `reminder_sent` で外れるので二重には送らない）
 */
export function runFinishPatch(failed: number, nowIso: string): { running_since: null; last_ok_at?: string } {
  return failed > 0 ? { running_since: null } : { running_since: null, last_ok_at: nowIso }
}

export type RunStats = { checked: number; sent: number; removed: number; failed: number }

/**
 * 回の終わりに `reminder_runs` へ残す数（`021`）。`last_failed_at` は失敗があった回だけ進める。
 * 目印を外す `runFinishPatch` とは別の update で書く（`021` を流す前の DB でも、目印を外して `last_ok_at` を進められるように）
 */
export function runStatsPatch(stats: RunStats, nowIso: string): Record<string, string | number> {
  const patch: Record<string, string | number> = {
    last_run_at: nowIso,
    last_checked: stats.checked,
    last_sent: stats.sent,
    last_removed: stats.removed,
    last_failed: stats.failed,
  }
  if (stats.failed > 0) patch.last_failed_at = nowIso
  return patch
}
