/**
 * フィード（Canvas のカレンダーフィード・Moodle の書き出し）が 2xx 以外を返したときのエラーコード。
 * - 401・403・404・410: その URL ではもう読めない（URL を作り直すと古い URL は 404 になる）→ canvas_feed_invalid（つなぎ直し）
 * - 429: 送りすぎ → canvas_rate_limited（待てば直る）
 * - それ以外（5xx・時間切れなど）: 学校のサーバーの一時的な失敗 → canvas_api（待てば直る。つなぎ直しを求めない）
 */
export function feedFailureCode(status: number): 'canvas_feed_invalid' | 'canvas_rate_limited' | 'canvas_api' {
  if (status === 401 || status === 403 || status === 404 || status === 410) return 'canvas_feed_invalid'
  if (status === 429) return 'canvas_rate_limited'
  return 'canvas_api'
}
