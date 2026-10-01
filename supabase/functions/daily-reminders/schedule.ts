/**
 * 通知を「いま送るか」を決める純粋な部分。
 *
 * Edge Function 本体（`index.ts`）は Deno 用で Supabase や web-push に触るため
 * そのままではテストできない。時刻の判定だけここに出して Node からも読めるようにする。
 */

/** cron の間隔（分）。この幅に入った通知を送る */
export const CRON_INTERVAL_MINUTES = 5

/** 締切時刻の無いタスクをまとめて知らせる既定の時刻（朝の計画が未設定のとき） */
export const DEFAULT_DUE_NOTIFY_MINUTES = 9 * 60

/** `HH:mm`（Postgres の time 列は `HH:mm:ss` で返ることもある）を 0 時からの分に。読めなければ null */
export function minutesOfClock(time: string | null | undefined): number | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** その分数が、いまの cron の幅（(now-5, now]）に入ったか */
export function isWithinTick(atMinutes: number, nowMinutes: number): boolean {
  return atMinutes <= nowMinutes && atMinutes > nowMinutes - CRON_INTERVAL_MINUTES
}

export interface DueCandidate {
  id: string
  title: string
  due_time: string | null
  list_id: string
}

/**
 * 今日が締切のタスクのうち、いま通知するものを選ぶ。
 *
 * - 締切時刻があればその時刻、無ければ朝の計画の時刻（未設定なら 9:00）
 * - 同じ時刻に重なったものはまとめて 1 通にする想定（呼び出し側）
 * - 除外リスト（いつか / 買い物）と、その日に通知済みのものは出さない
 */
export function selectDueToNotify(
  rows: readonly DueCandidate[],
  opts: {
    nowMinutes: number
    excludedListIds: ReadonlySet<string>
    notifiedIds: ReadonlySet<string>
    planTime?: string | null
  },
): DueCandidate[] {
  const fallback = minutesOfClock(opts.planTime) ?? DEFAULT_DUE_NOTIFY_MINUTES
  return rows.filter((r) => {
    if (opts.excludedListIds.has(r.list_id) || opts.notifiedIds.has(r.id)) return false
    const at = minutesOfClock(r.due_time) ?? fallback
    return isWithinTick(at, opts.nowMinutes)
  })
}
