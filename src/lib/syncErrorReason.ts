import type { SyncErrorReason } from '../types/sync'

/** 回線が届かないときに fetch が投げる文（ブラウザごとに違う）と、タイムアウト */
const OFFLINE =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|timed? ?out|aborterror/i
/** ログインの期限切れ・取り消し（Supabase の JWT・リフレッシュトークン、PostgREST の PGRST301〜303） */
const AUTH = /jwt|refresh token|invalid claim|not authenticated|unauthori[sz]ed|\b401\b|PGRST30[123]/i

function messageOf(err: unknown): string {
  if (err instanceof Error) return `${err.name} ${err.message}`
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const o = err as { message?: unknown; code?: unknown; status?: unknown }
    return [o.message, o.code, o.status].filter((v) => v != null).join(' ')
  }
  return ''
}

/**
 * 同期が失敗した理由を、利用者に出す文の分け方（回線・ログイン・それ以外）にまとめる。
 * 端末がオフラインなら中身によらず `offline`
 */
export function classifySyncError(err: unknown, online: boolean): SyncErrorReason {
  if (!online) return 'offline'
  const text = messageOf(err)
  if (AUTH.test(text)) return 'auth'
  if (OFFLINE.test(text)) return 'offline'
  return 'server'
}
