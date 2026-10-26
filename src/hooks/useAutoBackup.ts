import { useEffect } from 'react'
import { saveAutoBackup, type AutoBackupKind } from '../lib/autoBackup'
import { useTaskStore } from '../store/taskStore'
import { appTodayKey } from '../lib/timeZone'
import { backupJsonOf, hasSettingsData } from '../store/slices/data'
import type { TaskState } from '../store/storeTypes'
import { INBOX_LIST_ID } from '../store/storeConstants'
import { DEFAULT_LIST_IDS } from '../lib/syncMerge'

/** 開きっぱなしで日をまたいだときも、その日の控えを取る */
const CHECK_MS = 30 * 60_000

const listeners = new Set<() => void>()

/** 設定画面の一覧を、控えが増えたときに読み直させる */
export function onAutoBackupSaved(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 最初から作られるリスト（受信箱・いつか・買い物）。これだけなら控えるデータは無い */
const INITIAL_LIST_IDS = new Set<string>([INBOX_LIST_ID, ...Object.values(DEFAULT_LIST_IDS)])

/** To-Do 以外に控えるデータがあるか（習慣・セクション・自分で作ったリスト・気分・欠席・支払い …） */
function hasOtherData(s: TaskState): boolean {
  return s.habits.length > 0 || s.sections.length > 0 || s.lists.some((l) => !INITIAL_LIST_IDS.has(l.id)) || hasSettingsData(s)
}

/**
 * 今の状態を控える。控えるのは呼んだときの状態なので、直後に状態が変わっても控えは変わる前のもの。
 * 毎日の控えは、その日の分がもうあれば JSON を作らない（作るときも呼んだときの状態から、#257）。
 * 持ち主は手元のデータの持ち主（`dataOwner`）。分かっている呼び出し元は `owner` で渡す。
 * `rows` を渡すと、手元の行の代わりにその行を控える（同期で消える前のサーバーの行も入れるとき）。
 * 控えられたか（控えるデータが無ければ true）を返す。手元を消す前は、これを待ってから消す（#486）。
 * 毎日の控えは、その日の分がもうあっても false
 */
export async function backupNow(
  kind: AutoBackupKind,
  owner?: string | null,
  rows?: Pick<TaskState, 'tasks' | 'lists' | 'habits' | 'sections'>,
): Promise<boolean> {
  const s = rows ? { ...useTaskStore.getState(), ...rows } : useTaskStore.getState()
  const other = hasOtherData(s)
  if (s.tasks.length === 0 && !other) return true
  const json = kind === 'daily' ? () => backupJsonOf(s) : backupJsonOf(s)
  const saved = await saveAutoBackup(kind, appTodayKey(), s.tasks, json, owner ?? s.dataOwner, other)
  if (saved) listeners.forEach((l) => l())
  return saved
}

/**
 * 毎日の自動バックアップ。App の最初の描画で取るので、同期がサーバーの内容を反映するより前の状態が残る
 * （同期は取得の往復を待ってから反映する）。
 */
export function useAutoBackup() {
  useEffect(() => {
    void backupNow('daily')
    const onVisible = () => {
      if (document.visibilityState === 'visible') void backupNow('daily')
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => void backupNow('daily'), CHECK_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [])
}
