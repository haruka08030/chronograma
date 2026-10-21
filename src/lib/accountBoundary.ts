/**
 * アカウントの境目（ログアウト・ログアウトせずにアカウントが替わった・アカウント削除）で、端末の手元から何を片付けるか。
 * 道ごとに消すものが違って、ラベル表や通知の購読が次の人に残っていたので、どの道もここを通す
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { useTaskStore } from '../store/taskStore'
import { backupNow } from '../hooks/useAutoBackup'
import { detachWebPush, resyncWebPush } from './webPush'
import { clearBaseline } from './syncMerge'
import { clearSettingSyncedAt } from './settingSync'
import { clearAutoBackups } from './autoBackup'
import { clearIntegrationMemos, clearSignedOutLeftovers, clearSyncMirrors } from './deviceCleanup'
import { forgetGoogleConnected } from './googleConnectedHint'
import { clearGoogleEventCache } from './googleEventCache'
import { clearDialogDrafts } from './dialogDrafts'
import { askConfirm } from './confirmDialog'
import i18n from '../i18n/config'

/** もう無いと分かったアカウント（別の端末で消された）。この後の SIGNED_OUT で控えを取らない */
const goneAccounts = new Set<string>()

/** 問い合わせの答えを待つ長さ。回線が無いときにログアウトの片付けを長く止めない */
const GONE_CHECK_TIMEOUT_MS = 3000

/**
 * アカウントがもう無いか（別の端末で消された）を Supabase Auth に問い合わせる。`jwt` はログアウトした後に、最後のアクセストークンで聞くとき。
 * 「ユーザーがいない」（`user_not_found`）と返ったときだけ true。回線が無い・期限切れなど分からないときは false（控えを残す側に倒す）
 */
export async function isAccountGone(sb: SupabaseClient, jwt?: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), GONE_CHECK_TIMEOUT_MS)
  })
  const check = (async () => {
    try {
      const { error } = await sb.auth.getUser(jwt)
      return (error as { code?: string } | null)?.code === 'user_not_found'
    } catch {
      return false
    }
  })()
  try {
    return await Promise.race([check, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 消えたアカウント（自分で消した・別の端末で消された）の写しをこの端末から消す。
 * 手元のデータ・前回同期の控え・設定の同期の記録・前回取得したサーバーの内容・連携の控えと送り待ち・その人の自動バックアップを、控えを取らずに消す
 */
export async function clearDeletedAccount(userId: string): Promise<void> {
  goneAccounts.add(userId)
  await clearAccountData(userId, { backup: false })
  clearBaseline(userId)
  clearSettingSyncedAt(userId)
  clearSyncMirrors()
  clearIntegrationMemos()
  await clearAutoBackups(userId)
}

/**
 * 手元を消す前の控え（#486）。控えを取り終えるまで待ち、取れなければ消さずに、書き出してから進むかを聞く。
 * 進んでよければ true（書き出すと答えたら書き出してから）、取消なら false
 */
export async function backupBeforeClearing(kind: 'beforeSignOut' | 'beforeSignIn', owner: string | null): Promise<boolean> {
  if (await backupNow(kind, owner)) return true
  const ok = await askConfirm({
    title: i18n.t('accountBackup.failedTitle'),
    message: i18n.t('accountBackup.failed'),
    confirmLabel: i18n.t('accountBackup.exportAndContinue'),
  })
  if (!ok) return false
  useTaskStore.getState().exportData()
  return true
}

/** 消している途中（控えを待っている・聞いている間）。ログアウトのボタンと SIGNED_OUT の両方から来るので 1 回にまとめる */
let clearing: Promise<boolean> | null = null

/**
 * 手元のその人のデータ（タスク・リスト・習慣・セクション・ラベル表・他のタイムゾーン・予定の色）を空にし、空にしたかを返す。
 * 送れていなかった変更が消えないよう、データがあれば先に端末内に控えを取り、取り終えてから消す（持ち主は `owner`）。
 * 控えを取れず、利用者が取消を選んだら消さずに false。`backup: false` は控えを待たないので、呼んだその場で空にする
 */
export function clearAccountData(owner: string | null, opts: { backup?: boolean } = {}): Promise<boolean> {
  const store = useTaskStore.getState()
  // 一度も同期できていない（dataOwner が null の）データも、ログインしていた人のものなので消す。控えは残る
  const hasData = store.dataOwner !== null || store.tasks.length > 0 || store.habits.length > 0
  if (!hasData || opts.backup === false) {
    store.resetLocalData()
    // 閉じたダイアログの書きかけも次の人に見せない
    clearDialogDrafts()
    return Promise.resolve(true)
  }
  if (clearing) return clearing
  const run = (async () => {
    try {
      if (!(await backupBeforeClearing('beforeSignOut', store.dataOwner ?? owner))) return false
      useTaskStore.getState().resetLocalData()
      clearDialogDrafts()
      return true
    } finally {
      clearing = null
    }
  })()
  clearing = run
  return run
}

/**
 * ログアウトした（他のタブ・期限切れを含む）。Google の表示を外し、通知の購読を外し、データを空にする。
 * 保存データの写し・連携の前回取り込んだ値（題名）・前回同期の控えの中身も消す（`deviceCleanup.ts`。共用の端末で次の人の手元に残さない）。
 * Google の連携はサーバー側のアカウントに付いているので切らない（1 台でログアウトすると全端末の連携が外れた）
 */
export async function clearLocalAccountState(userId: string | null): Promise<void> {
  const store = useTaskStore.getState()
  store.setGoogleConnected(false)
  forgetGoogleConnected()
  clearGoogleEventCache()
  store.setGoogleAccessToken(null)
  store.setCalendarEvents([])
  store.setGoogleConnectionError(null)
  // 他のタブでのログアウトなど、ここに来た時点で行を消せなくても購読は解除する
  void detachWebPush()
  // 消えたアカウントのデータは控えない（消した人の写しを端末に残さない）
  const gone = userId !== null && goneAccounts.delete(userId)
  // 控えを取れずに取消を選んだら、手元のデータも前回同期の控えなども残す
  if (!(await clearAccountData(userId, { backup: !gone }))) return
  clearSignedOutLeftovers()
}

/**
 * ログアウトせずにアカウントが替わった（別のアカウントのログインのリンクを開いたなど）。前の人のデータを控えて空にし、
 * 前の人の通知の購読を外してから、今の人で購読し直す（前の人の endpoint の行は RLS で今の人には書けない）。
 * 控えを取れずに取消を選んだら空にせず false
 */
export async function clearPreviousAccount(): Promise<boolean> {
  if (!(await clearAccountData(null))) return false
  void detachWebPush().then(() => resyncWebPush())
  return true
}
