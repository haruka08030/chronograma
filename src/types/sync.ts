/** クラウド同期（Supabase）の今の状態。`limit` は 1 人が持てる行数の上限（`005_row_limits.sql`）に達して送れないとき */
export type SyncState = 'idle' | 'syncing' | 'error' | 'limit'

/** 連携（Notion・Canvas）の取り込みの状態。どの連携にもある部分 */
export interface SyncStatus {
  syncing: boolean
  lastSyncedAt: string | null
  /** 全体のエラー。サーバーのエラーコード（`notion_unauthorized` など）か、その他のメッセージ */
  error: string | null
}
