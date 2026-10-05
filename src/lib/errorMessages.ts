/** fetch 失敗・オフライン・Supabase プロジェクト停止などの接続エラーかを判定する */
export function isNetworkErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false
  return /failed to fetch|network ?error|fetch failed|load failed|err_network|err_internet_disconnected/i.test(message)
}

/**
 * ログイン用メールの送りすぎか。待つ秒数が分かれば返す（同じアドレスへの再送は数十秒あける決まり）。
 * 送りすぎでなければ null。Supabase の標準のメール送信は 1 時間あたりの通数も少ない
 */
export function otpRateLimit(
  error: { message?: string; status?: number; code?: string } | null | undefined,
): { seconds: number | null } | null {
  if (!error) return null
  const message = error.message ?? ''
  const after = /only request this after (\d+) seconds?/i.exec(message)
  if (after) return { seconds: Number(after[1]) }
  if (error.status === 429 || /rate.?limit/i.test(error.code ?? '') || /rate limit/i.test(message)) return { seconds: null }
  return null
}
