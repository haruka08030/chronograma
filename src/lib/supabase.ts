import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured || !url || !anonKey) return null
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
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
