import { googleWriteFailure } from './googleCalendar'
import { reportFailure } from './errorReport'

/**
 * Google に送るのを待っているアプリの予定（この端末の localStorage、利用者ごと）。`useGooglePush` が使う。
 * タブが何枚あっても失わないよう、変えるたびに読み込み→合わせて→書く。
 * 1 件ごとに、入れた時刻（`at`）と送れなかった回数（`tries`）を持つ。送れたら、その時刻のままのときだけ外す
 * （送っている間にまた直したものは残す）
 */

/** 1 件を自動で送り直す回数。ここまで送れなければ「送れていない予定」として出し、押されるまで送らない */
export const MAX_PUSH_TRIES = 5
/** タブを閉じるときに、応答を待たずに送る数の上限 */
export const LEAVE_SEND_MAX = 20

/** `revive`: アプリが Google から消した予定（ゴミ箱から戻した・送らない名前から外した）。Google で消えていても戻す */
export type PushEntry = { at: number; tries: number; revive?: boolean }
export type PushQueue = Record<string, PushEntry>

const PREFIX = 'chronograma.googlePush.'
export const pushQueueKey = (userId: string) => PREFIX + userId

export function loadPushQueue(userId: string): PushQueue {
  try {
    const raw = JSON.parse(localStorage.getItem(pushQueueKey(userId)) ?? '{}') as unknown
    const out: PushQueue = {}
    // 前の版は ID の並びだけ
    if (Array.isArray(raw)) {
      for (const id of raw) if (typeof id === 'string') out[id] = { at: 0, tries: 0 }
      return out
    }
    if (!raw || typeof raw !== 'object') return out
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      const e = v as Partial<PushEntry> | null
      if (e && typeof e.at === 'number' && typeof e.tries === 'number') {
        out[id] = e.revive ? { at: e.at, tries: e.tries, revive: true } : { at: e.at, tries: e.tries }
      }
    }
    return out
  } catch {
    return {}
  }
}

function savePushQueue(userId: string, queue: PushQueue) {
  try {
    if (Object.keys(queue).length === 0) localStorage.removeItem(pushQueueKey(userId))
    else localStorage.setItem(pushQueueKey(userId), JSON.stringify(queue))
  } catch {
    /* 保存できなくても、開いている間は送る */
  }
}

/** 読み込み→変える→書く（ほかのタブが足したものを上書きしない） */
function updatePushQueue(userId: string, change: (queue: PushQueue) => void): PushQueue {
  const queue = loadPushQueue(userId)
  change(queue)
  savePushQueue(userId, queue)
  return queue
}

let lastStamp = 0
/** 入れた時刻（同じミリ秒に 2 回入れても見分けられるように、前より必ず大きくする） */
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}

/** 送る予定を入れる。前に送れなかったものも、直したら数え直す。`revive` は Google で消えていても戻す予定 */
export function enqueuePush(userId: string, ids: readonly string[], revive: ReadonlySet<string> = new Set()): void {
  if (ids.length === 0) return
  updatePushQueue(userId, (q) => {
    for (const id of ids) {
      const back = revive.has(id) || q[id]?.revive === true
      q[id] = back ? { at: stamp(), tries: 0, revive: true } : { at: stamp(), tries: 0 }
    }
  })
}

/** 送れた。送っている間に入れ直されていなければ外す */
export function settlePush(userId: string, id: string, at: number): void {
  updatePushQueue(userId, (q) => {
    if (q[id]?.at === at) delete q[id]
  })
}

/** 送っても無駄なもの（他人の予定など）を外す */
export function dropPush(userId: string, id: string): void {
  updatePushQueue(userId, (q) => {
    delete q[id]
  })
}

/** 送れなかった回数を数える（入れ直されていれば数えない） */
function failPush(userId: string, id: string, at: number): void {
  updatePushQueue(userId, (q) => {
    const e = q[id]
    if (e?.at === at) e.tries++
  })
}

/** 自動で送るもの（送れなかった回数が上限に達していないもの） */
export function sendablePushIds(queue: PushQueue): string[] {
  return Object.keys(queue).filter((id) => queue[id].tries < MAX_PUSH_TRIES)
}

/** 何度送っても送れなかった数 */
export function failedPushCount(queue: PushQueue): number {
  return Object.values(queue).filter((e) => e.tries >= MAX_PUSH_TRIES).length
}

/** 「もう一度送る」: 送れなかったものを数え直す */
export function resetFailedPush(userId: string): void {
  updatePushQueue(userId, (q) => {
    for (const e of Object.values(q)) e.tries = 0
  })
}

/** Google との連携を外した: どの人の待ちも捨てる（つなぎ直しても、つなぐ前の変更は送らない） */
export function clearPushQueues(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    /* 消せなくても、送るときに断られる */
  }
}

/**
 * 1 回分送った結果。
 * - `done`: 送れるものは全部送った
 * - `retry`: 送れなかったものがある（その 1 件は飛ばして次を送った。少し待って送り直す）
 * - `wait`: 送りすぎ・回線が無い（数えずに、少し待って送り直す）
 * - `auth`: つながっていない・切れた（待ちは残し、つなぎ直したら送る）
 * - `scope`: 書き込みの許可が無い（待ちは残し、許可されたら送る）
 * - `cancelled`: 途中でやめた
 */
export type PushPassStatus = 'done' | 'retry' | 'wait' | 'auth' | 'scope' | 'cancelled'

/**
 * 待っているものを順に送る。`send` は 1 件を Google に送る（作る・直す・消す。`revive` なら消えていても戻す）。
 * Google で消されていた予定は待ちから外して `onDeleted` に渡す（アプリでもゴミ箱に入れる）
 */
export async function pushPass(
  userId: string,
  send: (taskId: string, revive: boolean) => Promise<void>,
  isCancelled: () => boolean = () => false,
  onDeleted: (taskId: string) => void = () => {},
): Promise<PushPassStatus> {
  let failed = false
  for (const id of sendablePushIds(loadPushQueue(userId))) {
    if (isCancelled()) return 'cancelled'
    // ほかのタブが送り終えていれば飛ばす
    const entry = loadPushQueue(userId)[id]
    if (!entry) continue
    const { at } = entry
    try {
      await send(id, entry.revive === true)
      settlePush(userId, id, at)
    } catch (e) {
      const kind = googleWriteFailure(e)
      if (kind === 'read_only') {
        dropPush(userId, id)
        continue
      }
      if (kind === 'deleted') {
        dropPush(userId, id)
        onDeleted(id)
        continue
      }
      if (kind === 'not_connected' || kind === 'auth_expired') return 'auth'
      if (kind === 'scope') return 'scope'
      if (kind === 'rate_limited' || kind === 'network') return 'wait'
      console.error('[google] push', e)
      reportFailure('integration', 'google:push', e)
      failPush(userId, id, at)
      failed = true
    }
  }
  return failed ? 'retry' : 'done'
}
