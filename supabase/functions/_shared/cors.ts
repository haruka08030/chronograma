/**
 * ブラウザから呼ぶ Edge Function の CORS。アプリの公開 URL と開発用の URL からだけ呼べるようにする。
 * 公開 URL は secret `ALLOWED_ORIGINS`（カンマ区切り。例 `https://chronograma.vercel.app`）で渡す。
 */

/** 開発サーバー（vite / vite preview）。いつでも許可する */
export const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]

const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'

/** `ALLOWED_ORIGINS` の値を origin の並びにする。末尾の `/` やパスは落とす */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  const out: string[] = []
  for (const part of (raw ?? '').split(',')) {
    const s = part.trim()
    if (!s) continue
    try {
      out.push(new URL(s).origin)
    } catch {
      // URL でない値は無視する
    }
  }
  return [...DEV_ORIGINS, ...out]
}

/** そのオリジンに返す CORS ヘッダー。許可していないオリジンには Allow-Origin を付けない */
export function corsHeadersFor(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  }
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

/**
 * ハンドラーを包み、プリフライトに答えて、すべての応答に CORS ヘッダーを付ける。
 * 許可していないオリジンからのプリフライトは 403 にする（ブラウザは本リクエストを送らない）。
 */
export function withCors(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    const origin = req.headers.get('Origin')
    const allowed = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'))
    const cors = corsHeadersFor(origin, allowed)
    if (req.method === 'OPTIONS') {
      return new Response(cors['Access-Control-Allow-Origin'] ? 'ok' : 'forbidden', {
        status: cors['Access-Control-Allow-Origin'] ? 200 : 403,
        headers: cors,
      })
    }
    const res = await handler(req)
    const headers = new Headers(res.headers)
    for (const [k, v] of Object.entries(cors)) headers.set(k, v)
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  }
}
