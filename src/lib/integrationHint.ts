/**
 * Notion・Canvas をこの人がつないでいないと、この端末で分かっているか（#445）。分かっていれば、起動時・画面に戻ったときの
 * 取り込みを呼ばない（呼ぶたびに関数の起動・ログインの確かめ・DB の読み込みがかかる）。
 * ほかの端末でつないだのを拾えるよう、しばらくしたら確かめ直す。設定から同期・接続したとき（手動）は、これを見ずに呼ぶ
 */
export type IntegrationService = 'notion' | 'canvas'

export const INTEGRATION_HINT_PREFIX = 'chronograma.integrationOff.'
/** つないでいないと分かってから、確かめ直すまで */
export const RECHECK_MS = 12 * 60 * 60 * 1000

/**
 * 画面に戻ったときに取り直すのは、前に取り始めてからこれだけ空いたときだけ（#448）。
 * タブを行き来するたびに全部を取り直し、取得中ならもう 1 回積んでいた
 */
export const REVISIT_MIN_MS = 60_000

/** 画面に戻ったので取り直すか（取得中・前に取り始めてすぐなら取り直さない） */
export function shouldRefetchOnReturn(running: boolean, lastStartedAt: number, now = Date.now()): boolean {
  return !running && now - lastStartedAt >= REVISIT_MIN_MS
}

const key = (service: IntegrationService, userId: string) => `${INTEGRATION_HINT_PREFIX}${service}.${userId}`

/** つないでいないと分かっていて、まだ確かめ直さなくてよい */
export function knownNotConnected(service: IntegrationService, userId: string, now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(key(service, userId)))
    return Number.isFinite(at) && at > 0 && now - at < RECHECK_MS
  } catch {
    return false
  }
}

/** 取り込みの結果で覚え直す（つないでいれば忘れる） */
export function noteIntegrationConnected(service: IntegrationService, userId: string, connected: boolean, now = Date.now()): void {
  try {
    if (connected) localStorage.removeItem(key(service, userId))
    else localStorage.setItem(key(service, userId), String(now))
  } catch {
    /* 覚えられなければ、次も呼ぶだけ */
  }
}
