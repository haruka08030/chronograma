/** クラウド同期（Supabase）の今の状態 */
export type SyncState = 'idle' | 'syncing' | 'error'

/** 連携（Notion・Canvas）の取り込みの状態。どの連携にもある部分 */
export interface SyncStatus {
  syncing: boolean
  lastSyncedAt: string | null
  /** 全体のエラー。サーバーのエラーコード（`notion_unauthorized` など）か、その他のメッセージ */
  error: string | null
}
