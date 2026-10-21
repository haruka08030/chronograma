import { useSyncExternalStore } from 'react'

/**
 * 自分でログアウトしていないのにログアウトした理由（#468）。次に開いたときにも出せるよう端末に覚える。
 * - expired: ログインの有効期限が切れた・ほかで取り消された（送れていなかった変更は端末内の控えにある）
 * - deleted: アカウントが別の端末で削除された（手元のデータも消える）
 * 自分でログアウト・アカウント削除したとき（ほかのタブで、を含む）は覚えない
 */
export type SignedOutReason = 'expired' | 'deleted'
export type SignedOutNotice = { reason: SignedOutReason; userId: string; at: number }

const KEY = 'chronograma.signedOutNotice'
const USER_SIGN_OUT_KEY = 'chronograma.userSignOutAt'
/** 自分でログアウトしてから SIGNED_OUT が届くまでの猶予 */
const USER_SIGN_OUT_WINDOW_MS = 60_000

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** 自分でログアウト・アカウント削除を始めた（ほかのタブにも分かるよう端末に書く） */
export function noteUserSignOut(now = Date.now()): void {
  try {
    localStorage.setItem(USER_SIGN_OUT_KEY, String(now))
  } catch {
    /* 書けなければ、理由を出してしまうだけ */
  }
}

function wasUserSignOut(now: number): boolean {
  try {
    const at = Number(localStorage.getItem(USER_SIGN_OUT_KEY))
    return Number.isFinite(at) && at > 0 && now - at < USER_SIGN_OUT_WINDOW_MS
  } catch {
    return false
  }
}

/** ログアウトした（SIGNED_OUT）。自分で始めたのでなければ理由を覚える */
export function noteSignedOut(reason: SignedOutReason, userId: string, now = Date.now()): void {
  if (wasUserSignOut(now)) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ reason, userId, at: now } satisfies SignedOutNotice))
  } catch {
    return
  }
  emit()
}

export function readSignedOutNotice(): SignedOutNotice | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SignedOutNotice | null
    return v && (v.reason === 'expired' || v.reason === 'deleted') && typeof v.userId === 'string' ? v : null
  } catch {
    return null
  }
}

export function clearSignedOutNotice(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 消せなくても次に閉じれば消える */
  }
  emit()
}

let cached: { raw: string | null; value: SignedOutNotice | null } = { raw: null, value: null }
function snapshot(): SignedOutNotice | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    /* 読めなければ無い */
  }
  if (raw !== cached.raw) cached = { raw, value: readSignedOutNotice() }
  return cached.value
}

export function useSignedOutNotice(): SignedOutNotice | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      // ほかのタブで覚えた・消したとき
      window.addEventListener('storage', l)
      return () => {
        listeners.delete(l)
        window.removeEventListener('storage', l)
      }
    },
    snapshot,
    () => null,
  )
}
