/**
 * 連携（Notion・Canvas）への書き戻しのうち、まだ届いていないもの。この端末の localStorage に人ごとに置き、
 * 届くまで間隔をあけて送り直す（タブを閉じても次に開いたときに送る）。
 * 同じ端末のほかのタブと分け合うので、読み書きのたびに保存先から読み直す（手元に写しを持たない）。
 */

export const WRITE_BACK_PREFIX = 'chronograma-writeback-v1:'
/** Google カレンダーに送るのを待っているアプリの予定（`googlePushQueue.ts`、利用者ごと）。片付け（`deviceCleanup.ts`）も同じ前置きで消す */
export const GOOGLE_PUSH_PREFIX = 'chronograma.googlePush.'

export type WriteBackEntry<P> = {
  payload: P
  /** 失敗した回数 */
  attempts: number
  /** 次に送ってよい時刻（ms） */
  nextAt: number
  /** 最初に積んだ時刻（ms）。古くなりすぎたものは捨てる */
  since: number
}

/** 1 回目の送り直しまでの間隔。失敗するたびに倍にする */
const FIRST_RETRY_MS = 30_000
const MAX_RETRY_MS = 60 * 60_000
/** これより古いものは捨てる（その間に Canvas・Notion 側で直されているはず） */
const MAX_AGE_MS = 7 * 86_400_000

export function retryDelayMs(attempts: number): number {
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1))
}

export type WriteBackQueue<P> = {
  /** 送る予定に積む（積み直すと失敗の回数は 0 に戻る） */
  put(id: string, payload: P, now?: number): void
  /** 送れなかった。次に送ってよい時刻を後ろへずらす */
  fail(id: string, now?: number): void
  /** 送れた・もう送らなくてよい */
  done(id: string): void
  /** 積んであるもの（古すぎるものは捨てる） */
  all(now?: number): Array<[string, WriteBackEntry<P>]>
  /** いま送ってよいもの */
  due(now?: number): Array<[string, WriteBackEntry<P>]>
  /** 次に送ってよい時刻のうち一番早いもの。無ければ null */
  nextDueAt(now?: number): number | null
}

export function writeBackQueue<P>(key: string): WriteBackQueue<P> {
  const load = (): Record<string, WriteBackEntry<P>> => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
      return raw && typeof raw === 'object' ? (raw as Record<string, WriteBackEntry<P>>) : {}
    } catch {
      return {}
    }
  }
  const save = (q: Record<string, WriteBackEntry<P>>) => {
    try {
      if (Object.keys(q).length === 0) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify(q))
    } catch {
      /* 覚えられなければ、このタブを開いている間だけの送り直しになる */
    }
  }
  const fresh = (now: number) => {
    const q = load()
    let dropped = false
    for (const [id, e] of Object.entries(q)) {
      if (!e || typeof e.nextAt !== 'number' || typeof e.since !== 'number' || now - e.since > MAX_AGE_MS) {
        delete q[id]
        dropped = true
      }
    }
    if (dropped) save(q)
    return q
  }

  return {
    put(id, payload, now = Date.now()) {
      const q = load()
      q[id] = { payload, attempts: 0, nextAt: now, since: now }
      save(q)
    },
    fail(id, now = Date.now()) {
      const q = load()
      const e = q[id]
      if (!e) return
      const attempts = e.attempts + 1
      q[id] = { ...e, attempts, nextAt: now + retryDelayMs(attempts) }
      save(q)
    },
    done(id) {
      const q = load()
      if (!(id in q)) return
      delete q[id]
      save(q)
    },
    all(now = Date.now()) {
      return Object.entries(fresh(now))
    },
    due(now = Date.now()) {
      return Object.entries(fresh(now)).filter(([, e]) => e.nextAt <= now)
    },
    nextDueAt(now = Date.now()) {
      const times = Object.values(fresh(now)).map((e) => e.nextAt)
      return times.length > 0 ? Math.min(...times) : null
    },
  }
}
