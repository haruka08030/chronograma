import type { SupabaseClient } from '@supabase/supabase-js'

/*
 * Supabase のつなぎ口。`@supabase/supabase-js`（約 186 kB）はログインしている人・ログインしようとしている人の分だけ
 * `loadSupabase()` で後から読む（#268）。端末だけに保存する人は読まない。
 * 読むのは: ログインのセッションが保存されている・ログインの戻り（URL のハッシュ）・ログインを始めた・ほかのタブでログインした とき
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null
let loading: Promise<SupabaseClient | null> | null = null
const loadedListeners = new Set<(sb: SupabaseClient) => void>()

/** 読み込み済みのクライアント。まだ読んでいない（ログインしていない）・設定が無いときは null */
export function getSupabase(): SupabaseClient | null {
  return client
}

/** クライアントを読み込む（読み込み済みならそれ）。設定が無ければ null */
export function loadSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured || !url || !anonKey) return Promise.resolve(null)
  if (client) return Promise.resolve(client)
  loading ??= import('@supabase/supabase-js').then(
    ({ createClient }) => {
      client ??= createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
      for (const cb of [...loadedListeners]) cb(client)
      return client
    },
    (err: unknown) => {
      // 読み込めなかった（オフラインなど）。次に呼ばれたときに読み直す
      loading = null
      throw err
    },
  )
  return loading
}

/** クライアントを読み込んだら呼ぶ（読み込み済みならすぐ）。返した関数でやめる */
export function onSupabaseLoaded(cb: (sb: SupabaseClient) => void): () => void {
  if (client) cb(client)
  loadedListeners.add(cb)
  return () => {
    loadedListeners.delete(cb)
  }
}

/** Supabase がログインのセッションを保存する localStorage のキー（`sb-<ref>-auth-token`） */
export const AUTH_TOKEN_KEY = /^sb-.+-auth-token$/

/** この端末にログインのセッションが保存されているか（Supabase を読まずに見る） */
export function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && AUTH_TOKEN_KEY.test(key)) return true
    }
  } catch {
    /* 保存領域が使えなければセッションも無い */
  }
  return false
}

/** ログイン（メールのリンク・Google）から戻ってきた URL か。Supabase がハッシュからセッションを読む */
export function isAuthRedirect(hash: string = typeof window === 'undefined' ? '' : window.location.hash): boolean {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return params.has('access_token') || params.has('refresh_token')
}

/** 起動したときに Supabase を読むか（ログインしている・ログインから戻ってきた） */
export function needsSupabaseAtStart(): boolean {
  return isSupabaseConfigured && (hasStoredSession() || isAuthRedirect())
}

/**
 * この端末だけログアウトする。回線が無いとサーバーでの取り消しが失敗し、auth-js はセッションを残したまま
 * エラーを返す（そのまま端末のデータだけ消すと「ログインしたまま空」になっていた）。そのときは端末に
 * 保存したセッションを自分で消す。サーバー側のセッションは期限切れまで残るが、この端末からは使われない
 */
export async function signOutThisDevice(sb: SupabaseClient): Promise<void> {
  const { error } = await sb.auth.signOut({ scope: 'local' })
  if (!error) return
  // auth-js の内部の片付け（保存したセッションを消し、ほかのタブにも SIGNED_OUT を知らせる）
  const auth = sb.auth as unknown as { _removeSession?: () => Promise<void> }
  if (typeof auth._removeSession === 'function') {
    await auth._removeSession()
    return
  }
  // 内部が変わっていたら、保存したセッション（`sb-<ref>-auth-token`）を直接消す
  try {
    for (const key of Object.keys(localStorage)) {
      if (/^sb-.+-auth-token/.test(key)) localStorage.removeItem(key)
    }
  } catch {
    /* 保存領域が使えなければ消すものも無い */
  }
}

/**
 * タブを閉じる・隠れる瞬間に Edge Function を呼ぶ。`functions.invoke` はセッションの読み出しを待ち、
 * ページが消えると送信ごと捨てられるので、手元のアクセストークンで `keepalive` の fetch を送る。応答は待たない。
 */
export function sendFunctionOnLeave(name: string, body: Record<string, unknown>, accessToken: string): void {
  if (!url || !anonKey) return
  void fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    keepalive: true,
    headers: { Authorization: `Bearer ${accessToken}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {})
}
