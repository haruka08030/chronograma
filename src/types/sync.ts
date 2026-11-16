/** クラウド同期（Supabase）の今の状態。`limit` は 1 人が持てる行数の上限（`005_row_limits.sql`）に達して送れないとき */
/** `outdated`: アプリの版が同期の下限より古い（送らずに読み込み直しを促す） */
export type SyncState = 'idle' | 'syncing' | 'error' | 'limit' | 'outdated'

/** `error` のときの理由。`offline` は回線、`auth` はログインの期限切れ、`server` はそれ以外（サーバーの不調・想定外） */
export type SyncErrorReason = 'offline' | 'auth' | 'server'

/** 連携（Notion・Canvas）の取り込みの状態。どの連携にもある部分 */
export interface SyncStatus {
  syncing: boolean
  lastSyncedAt: string | null
  /** 全体のエラー。サーバーのエラーコード（`notion_unauthorized` など）か、その他のメッセージ */
  error: string | null
}
