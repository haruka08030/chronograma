import { reportSyncError } from './errorReport'
import type { MergeConflictCounts } from './syncMerge'

/**
 * 両方の端末が同じ項目を変えて、新しいほうに任せた（片方の編集を捨てた）回数を記録に送る（#357、#285）。
 * 送るのは `表.項目` ごとの回数と、数え始めた時刻だけ（タイトルなどの中身は送らない）。
 * 回数は端末にためておき（localStorage）、送るのは 1 日 1 回まで。ためている間にページを閉じても次に開いたときに足していく。
 * どこから呼んでも例外を投げない
 */

/** ためておく場所（localStorage） */
export const MERGE_CONFLICTS_KEY = 'chronograma-merge-conflicts-v1'
/** 送る間（最後に送ってからこれだけ経つまで、ためておく） */
export const MERGE_CONFLICT_REPORT_INTERVAL_MS = 24 * 60 * 60_000
/** 送る項目の数の上限（記録の大きさの上限に収める） */
const MAX_KEYS = 40
/** 項目の名前として送ってよい形（表名.項目名。コードの名前だけ） */
const KEY_SHAPE = /^(lists|sections|tasks|habits)\.[A-Za-z_][A-Za-z0-9_]{0,39}$/

type Stored = { counts: MergeConflictCounts; since: string | null; lastSentAt: number }

/** 読めなければ空から（このページの間だけでも数える） */
let memory: Stored | null = null

function load(): Stored {
  try {
    const raw = localStorage.getItem(MERGE_CONFLICTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null
    if (parsed && typeof parsed === 'object') {
      const counts: MergeConflictCounts = {}
      for (const [k, v] of Object.entries(parsed.counts ?? {})) {
        if (KEY_SHAPE.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) counts[k] = Math.floor(v)
      }
      return {
        counts,
        since: typeof parsed.since === 'string' ? parsed.since : null,
        lastSentAt: typeof parsed.lastSentAt === 'number' && Number.isFinite(parsed.lastSentAt) ? parsed.lastSentAt : 0,
      }
    }
  } catch {
    // 読めなければこのページで数えたぶんだけ
  }
  return memory ?? { counts: {}, since: null, lastSentAt: 0 }
}

function save(s: Stored): void {
  memory = s
  try {
    localStorage.setItem(MERGE_CONFLICTS_KEY, JSON.stringify(s))
  } catch {
    // 保存できなければこのページの間だけ数える
  }
}

/** テスト用 */
export function resetMergeConflictReportForTests(): void {
  memory = null
}

/**
 * 1 回のマージで数えた回数を足し、前回送ってから 1 日経っていれば送る（数えたものが無ければ送らない）。
 * 同期のたびに呼んでよい（新しく数えたものが無くても、ためていたものを送る時期かを見る）
 */
export function noteMergeConflicts(conflicts: MergeConflictCounts, now: Date = new Date()): void {
  try {
    const s = load()
    const counts = { ...s.counts }
    let since = s.since
    let added = false
    for (const [k, v] of Object.entries(conflicts)) {
      if (!KEY_SHAPE.test(k) || !(v > 0)) continue
      if (!(k in counts) && Object.keys(counts).length >= MAX_KEYS) continue
      counts[k] = (counts[k] ?? 0) + v
      since ??= now.toISOString()
      added = true
    }
    const keys = Object.keys(counts)
    const nowMs = now.getTime()
    // 回線が無いと送れない（送ったことにして捨てない）
    const online = typeof navigator === 'undefined' || navigator.onLine !== false
    if (keys.length > 0 && online && nowMs - s.lastSentAt >= MERGE_CONFLICT_REPORT_INTERVAL_MS) {
      const total = keys.reduce((n, k) => n + counts[k], 0)
      // メッセージは毎回同じ形（同じエラーは 10 分に 1 回までの間引きに入る）。中身は extra に
      reportSyncError('merge-conflicts', 'newer side won on fields edited on both devices', {
        conflicts: Object.fromEntries(keys.sort().map((k) => [k, counts[k]])),
        total,
        since,
      })
      save({ counts: {}, since: null, lastSentAt: nowMs })
      return
    }
    if (added) save({ counts, since, lastSentAt: s.lastSentAt })
  } catch {
    // 記録できなくても同期は続ける
  }
}
