/**
 * アカウントの境目（ログアウト・ログアウトせずにアカウントが替わった・アカウント削除）で、端末の手元から何を片付けるか。
 * 道ごとに消すものが違って、ラベル表や通知の購読が次の人に残っていたので、どの道もここを通す
 */
import { useTaskStore } from '../store/taskStore'
import { backupNow } from '../hooks/useAutoBackup'
import { detachWebPush, resyncWebPush } from './webPush'

/**
 * 手元のその人のデータ（タスク・リスト・習慣・セクション・ラベル表・他のタイムゾーン・予定の色）を空にする。
 * 送れていなかった変更が消えないよう、データがあれば先に端末内に控えを取る（持ち主は `owner`）
 */
export function clearAccountData(owner: string | null, opts: { backup?: boolean } = {}): void {
  const store = useTaskStore.getState()
  // 一度も同期できていない（dataOwner が null の）データも、ログインしていた人のものなので消す。控えは残る
  const hasData = store.dataOwner !== null || store.tasks.length > 0 || store.habits.length > 0
  if (hasData && opts.backup !== false) backupNow('beforeSignOut', store.dataOwner ?? owner)
  store.resetLocalData()
}

/**
 * ログアウトした（他のタブ・期限切れを含む）。Google の表示を外し、通知の購読を外し、データを空にする。
 * Google の連携はサーバー側のアカウントに付いているので切らない（1 台でログアウトすると全端末の連携が外れた）
 */
export function clearLocalAccountState(userId: string | null): void {
  const store = useTaskStore.getState()
  store.setGoogleConnected(false)
  store.setGoogleAccessToken(null)
  store.setCalendarEvents([])
  store.setGoogleConnectionError(null)
  // 他のタブでのログアウトなど、ここに来た時点で行を消せなくても購読は解除する
  void detachWebPush()
  clearAccountData(userId)
}

/**
 * ログアウトせずにアカウントが替わった（別のアカウントのログインのリンクを開いたなど）。前の人のデータを控えて空にし、
 * 前の人の通知の購読を外してから、今の人で購読し直す（前の人の endpoint の行は RLS で今の人には書けない）
 */
export function clearPreviousAccount(): void {
  clearAccountData(null)
  void detachWebPush().then(() => resyncWebPush())
}
