/** Edge Function がエラーのときに返す本文（`supabase/functions/_shared/http.ts` の `errorResponse`） */
export type FunctionErrorBody = { ok?: boolean; code?: string; error?: string }

/**
 * `functions.invoke` のエラーから、関数が返した本文を読む。
 * 関数は 4xx / 5xx でも `{ ok: false, error, code? }` を返すが、supabase-js は 2xx 以外を
 * `FunctionsHttpError` にして `data` を null にするので、本文は `error.context`（Response）から読む。
 * 関数まで届かなかった・本文が JSON でないときは null。
 * `instanceof FunctionsHttpError` で見分けると、それだけのために `@supabase/supabase-js` を起動時に読むことになる（#268）ので、
 * 名前と `context` が Response かで見分ける
 */
export async function readFunctionErrorBody(error: unknown): Promise<FunctionErrorBody | null> {
  if (!(error instanceof Error) || error.name !== 'FunctionsHttpError') return null
  const res = (error as Error & { context?: unknown }).context
  if (!(res instanceof Response)) return null
  try {
    const body: unknown = await res.clone().json()
    return body && typeof body === 'object' ? (body as FunctionErrorBody) : null
  } catch {
    return null
  }
}

/** エラーの本文があればその `error`、無ければ例外の文言 */
export async function functionErrorMessage(error: unknown, fallback = 'Edge Function request failed'): Promise<string> {
  const body = await readFunctionErrorBody(error)
  if (typeof body?.error === 'string' && body.error) return body.error
  if (typeof body?.code === 'string' && body.code) return body.code
  if (error instanceof Error && error.message) return error.message
  return fallback
}
