import { useEffect } from 'react'
import { saveAutoBackup, type AutoBackupKind } from '../lib/autoBackup'
import { useTaskStore } from '../store/taskStore'
import { toDateKey } from '../lib/dateKey'

/** 開きっぱなしで日をまたいだときも、その日の控えを取る */
const CHECK_MS = 30 * 60_000

const listeners = new Set<() => void>()

/** 設定画面の一覧を、控えが増えたときに読み直させる */
export function onAutoBackupSaved(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * 今の状態を控える。JSON はここで同期的に作るので、直後に状態が変わっても控えは変わる前のもの。
 * 持ち主は手元のデータの持ち主（`dataOwner`）。分かっている呼び出し元は `owner` で渡す
 */
export function backupNow(kind: AutoBackupKind, owner?: string | null) {
  const s = useTaskStore.getState()
  void saveAutoBackup(kind, toDateKey(new Date()), s.tasks, s.backupJson(), owner ?? s.dataOwner).then((saved) => {
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
