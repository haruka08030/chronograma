/**
 * Edge Function の応答と、リクエスト本文の読み取り。
 * エラーも `{ ok: false, error, code? }` の形のまま、内容に合った HTTP ステータスで返す
 * （クライアントは `FunctionsHttpError.context` から同じ本文を読んで訳す）。
 *  - 本文が JSON でない・入力の誤り → 400
 *  - ログインしていない → 401
 *  - 連携がまだ無いなど、今の状態ではできない → 409
 *  - 送りすぎ → 429
 *  - こちらの不具合・設定ミス → 500
 *  - 外のサービス（Google / Notion / Canvas）が断った・失敗した → 502
 */

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** `{ ok: false, error, code? }` を返す。`code` は Notion / Canvas の画面が訳すためのもの */
export function errorResponse(status: number, error: string, code?: string): Response {
  return jsonResponse(code ? { ok: false, code, error } : { ok: false, error }, status)
}

/**
 * 連携先のエラーコード（`notion_rate_limited` / `canvas_bad_url` など）の HTTP ステータス。
 * 利用者が直せる入力の誤りは 400、送りすぎは 429、それ以外（連携先が断った・落ちている）は 502
 */
export function integrationErrorStatus(code: string): number {
  if (code.endsWith('_rate_limited')) return 429
  if (/_(bad_url|feed_invalid|too_many)$/.test(code)) return 400
  return 502
}

export const BAD_JSON = 'Invalid JSON body'

/**
 * リクエスト本文を JSON のオブジェクトとして読む。POST 以外・空の本文は `{}`。
 * JSON でない・オブジェクトでない（配列や数）なら null（呼ぶ側で 400 を返す）
 */
export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  if (req.method !== 'POST') return {}
  let text: string
  try {
    text = await req.text()
  } catch {
    return null
  }
  if (!text.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
