/**
 * 通知の一斉送信で使う、DB や Web Push に依存しない部品。
 * - 購読を 1000 行ずつ（PostgREST の上限）読み切る
 * - 利用者ごとの処理を決まった数だけ同時に走らせる（1 人の失敗でほかを止めない）
 * - 1 つの購読への送信を並べて送り、成功したものと失効したかをまとめる
 */

/** PostgREST が 1 回に返す行の上限（max_rows の既定） */
export const PAGE_SIZE = 1000

/**
 * `fetchPage(from, to)`（両端を含む行番号）を、短いページが返るまで呼んで全部つなげる。
 * 並びは呼ぶ側で安定したキーにしておく（ページの境目で行が重なったり抜けたりしないように）
 */
export async function fetchAllPages<T>(fetchPage: (from: number, to: number) => Promise<T[]>, pageSize = PAGE_SIZE): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1)
    out.push(...page)
    if (page.length < pageSize) return out
  }
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
