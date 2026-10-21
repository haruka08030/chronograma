import { useSupabaseSync } from '../hooks/useSupabaseSync'
import { useNotionSync } from '../hooks/useNotionSync'
import { useCanvasSync } from '../hooks/useCanvasSync'
import { useGooglePush } from '../hooks/useGooglePush'

/**
 * ログインしている間の同期と連携（Supabase の同期・Notion・Canvas・Google カレンダーへの送信）。何も描かない。
 * ログインしていない人には要らないので、起動時には読まない（`AccountSyncLoader` がログインしてから読む）
 */
export function AccountSync() {
  useSupabaseSync()
  useNotionSync()
  useCanvasSync()
  useGooglePush()
  return null
}
