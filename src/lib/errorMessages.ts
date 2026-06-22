/** fetch 失敗・オフライン・Supabase プロジェクト停止などの接続エラーかを判定する */
export function isNetworkErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false
  return /failed to fetch|network ?error|fetch failed|load failed|err_network|err_internet_disconnected/i.test(
    message,
  )
}
