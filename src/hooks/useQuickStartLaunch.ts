import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTaskStore } from '../store/taskStore'
import { hasPendingQuickStart, QUICK_START_SYNC_WAIT_MS, quickStartReady, runQuickStart, takeQuickStart } from '../lib/quickStart'

/**
 * 起動 URL `?start=last`（`consumeLaunch` が読んで消す）を、データがそろってから実行する（`quickStart.ts`）。
 * どの結果でも記録パネルのある「今日の計画」を開き、何をしたかをトーストで知らせる
 */
export function useQuickStartLaunch() {
  const { user, loading } = useAuth()
  const lastSyncedAt = useTaskStore((s) => s.lastSyncedAt)
  const syncState = useTaskStore((s) => s.syncState)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!hasPendingQuickStart()) return
    const id = setTimeout(() => setTimedOut(true), QUICK_START_SYNC_WAIT_MS)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!hasPendingQuickStart()) return
    if (!quickStartReady({ authLoading: loading, signedIn: user != null, lastSyncedAt, syncState, timedOut })) return
    // 取り出すのは 1 回だけ（StrictMode で effect が 2 回走っても二重に始めない）
    if (!takeQuickStart()) return
    const s = useTaskStore.getState()
    const result = runQuickStart(s)
    s.selectView('planner')
    if (result.kind === 'running') s.showMoveBanner({ key: 'quickStart.alreadyRunning', params: { title: result.title } })
    else if (result.kind === 'started') s.showMoveBanner({ key: 'quickStart.started', params: { title: result.title } })
    else s.showMoveBanner({ key: 'quickStart.noPrevious' })
  }, [loading, user, lastSyncedAt, syncState, timedOut])
}
