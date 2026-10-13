import { useEffect } from 'react'
import { saveAutoBackup, type AutoBackupKind } from '../lib/autoBackup'
import { useTaskStore } from '../store/taskStore'
import { appTodayKey } from '../lib/timeZone'
import { backupJsonOf } from '../store/slices/data'

/** 開きっぱなしで日をまたいだときも、その日の控えを取る */
const CHECK_MS = 30 * 60_000

const listeners = new Set<() => void>()

/** 設定画面の一覧を、控えが増えたときに読み直させる */
export function onAutoBackupSaved(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * 今の状態を控える。控えるのは呼んだときの状態なので、直後に状態が変わっても控えは変わる前のもの。
 * 毎日の控えは、その日の分がもうあれば JSON を作らない（作るときも呼んだときの状態から、#257）。
 * 持ち主は手元のデータの持ち主（`dataOwner`）。分かっている呼び出し元は `owner` で渡す
 */
export function backupNow(kind: AutoBackupKind, owner?: string | null) {
  const s = useTaskStore.getState()
  const json = kind === 'daily' ? () => backupJsonOf(s) : s.backupJson()
  void saveAutoBackup(kind, appTodayKey(), s.tasks, json, owner ?? s.dataOwner).then((saved) => {
    if (saved) listeners.forEach((l) => l())
  })
}

/**
 * 毎日の自動バックアップ。App の最初の描画で取るので、同期がサーバーの内容を反映するより前の状態が残る
 * （同期は取得の往復を待ってから反映する）。
 */
export function useAutoBackup() {
  useEffect(() => {
    backupNow('daily')
    const onVisible = () => {
      if (document.visibilityState === 'visible') backupNow('daily')
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => backupNow('daily'), CHECK_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [])
}
