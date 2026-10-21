/** Edge Function がエラーのときに返す本文（`supabase/functions/_shared/http.ts` の `errorResponse`） */
export type FunctionErrorBody = { ok?: boolean; code?: string; error?: string }

/**
 * `functions.invoke` のエラーの種類。
 * - network: 関数まで届かなかった（`FunctionsFetchError`・`FunctionsRelayError`）か、関数の前のゲートウェイが JSON でない 5xx を返した。待てば直る
 * - http: 関数が 2xx 以外を返した（本文の `code` があればそれ）
 * - unknown: それ以外の例外
 */
export type FunctionErrorKind = 'network' | 'http' | 'unknown'

export type FunctionErrorInfo = {
  kind: FunctionErrorKind
  /** 応答の状態コード。届かなかったときは null */
  status: number | null
  /** 関数が返した `code`。無ければ null */
  code: string | null
  message: string
}

/** 名前で見分ける（`instanceof` のためだけに `@supabase/supabase-js` を起動時に読まない、#268） */
const errorName = (error: unknown) => (error instanceof Error ? error.name : null)

function responseOf(error: unknown): Response | null {
  if (errorName(error) !== 'FunctionsHttpError') return null
  const res = (error as Error & { context?: unknown }).context
  return res instanceof Response ? res : null
}

/**
 * `functions.invoke` のエラーから、関数が返した本文を読む。
 * 関数は 4xx / 5xx でも `{ ok: false, error, code? }` を返すが、supabase-js は 2xx 以外を
 * `FunctionsHttpError` にして `data` を null にするので、本文は `error.context`（Response）から読む。
 * 関数まで届かなかった・本文が JSON でないときは null。
 * `instanceof FunctionsHttpError` で見分けると、それだけのために `@supabase/supabase-js` を起動時に読むことになる（#268）ので、
 * 名前と `context` が Response かで見分ける
 */
export async function readFunctionErrorBody(error: unknown): Promise<FunctionErrorBody | null> {
  const res = responseOf(error)
  if (!res) return null
  try {
    const body: unknown = await res.clone().json()
    return body && typeof body === 'object' ? (body as FunctionErrorBody) : null
  } catch {
    return null
  }
}

/** エラーを種類・状態コード・コード・文言に分ける */
export async function classifyFunctionError(error: unknown, fallback = 'Edge Function request failed'): Promise<FunctionErrorInfo> {
  const name = errorName(error)
  const raw = error instanceof Error && error.message ? error.message : fallback
  if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError') {
    return { kind: 'network', status: null, code: null, message: raw }
  }
  const res = responseOf(error)
  if (res) {
    const body = await readFunctionErrorBody(error)
    const code = typeof body?.code === 'string' && body.code ? body.code : null
    const text = typeof body?.error === 'string' && body.error ? body.error : code
    // 本文が JSON でない 5xx は関数の前（ゲートウェイ）の一時的な失敗
    if (!body && res.status >= 500) return { kind: 'network', status: res.status, code: null, message: raw }
    return { kind: 'http', status: res.status, code, message: text ?? raw }
  }
  return { kind: 'unknown', status: null, code: null, message: raw }
}

/**
 * エラーの本文があればその `error`、無ければ例外の文言。
 * 届かなかった・ゲートウェイの 5xx は「Network error」で始まる文言にする（`isNetworkErrorMessage` で一時的な失敗と分かるように）
 */
export async function functionErrorMessage(error: unknown, fallback = 'Edge Function request failed'): Promise<string> {
  const info = await classifyFunctionError(error, fallback)
  if (info.kind === 'network') return `Network error: ${info.status ? `HTTP ${info.status}` : info.message}`
  return info.message
}
