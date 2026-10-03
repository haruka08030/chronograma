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
