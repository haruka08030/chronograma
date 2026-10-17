/**
 * 連携の接続が切れて、つなぎ直さないと直らないエラー（#449・#450）。待てば直るもの（送りすぎ・一時的な失敗）は入れない。
 * - Notion: シークレットが無効になった・データベースの共有が外れた
 * - Canvas: トークンが無効・期限切れ、カレンダーフィードが無効
 */
const RECONNECT_CODES = new Set(['notion_unauthorized', 'notion_not_shared', 'canvas_unauthorized', 'canvas_feed_invalid'])

export function needsReconnect(code: string | null | undefined): boolean {
  return code != null && RECONNECT_CODES.has(code)
}
