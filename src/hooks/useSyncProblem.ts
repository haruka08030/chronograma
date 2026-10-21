import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useTaskStore } from '../store/taskStore'
import { relativeSyncKey } from '../components/syncIndicatorLabel'

export type SyncProblem =
  | { kind: 'error'; detail: string }
  | { kind: 'limit'; detail: string }
  | { kind: 'outdated'; detail: string }
  | { kind: 'rejected'; detail: string; count: number }

/**
 * 同期の問題と、その説明の文（PC の SyncIndicator とスマホの 1 行で同じものを使う、#467）。
 * ログインしていない・同期できている・送っている最中は null
 */
export function useSyncProblem(): SyncProblem | null {
  const { t } = useTranslation()
  const { user } = useAuth()
  const syncState = useTaskStore((s) => s.syncState)
  const lastSyncedAt = useTaskStore((s) => s.lastSyncedAt)
  const rejected = useTaskStore((s) => s.syncRejected)
  const showing = Boolean(user) && (syncState === 'error' || syncState === 'limit' || syncState === 'outdated' || rejected.length > 0)
  /** 「3 分前」を据え置かないよう 1 分ごとに読み直す */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!showing) return
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 60_000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [showing, lastSyncedAt])

  if (!showing) return null
  if (syncState === 'outdated') return { kind: 'outdated', detail: t('sync.outdated') }
  if (syncState === 'limit') return { kind: 'limit', detail: t('sync.limit') }
  if (syncState === 'error') {
    const last = lastSyncedAt ? relativeSyncKey(lastSyncedAt, now) : null
    const when = last ? t(last.key, { count: last.count }) : null
    return { kind: 'error', detail: when ? t('sync.errorWithLast', { when }) : t('sync.error') }
  }
  // 一部の行だけサーバーに拒否された。ほかは同期できているので、件数と対象だけ伝える
  const s = useTaskStore.getState()
  const names = rejected.slice(0, 3).map((r) => {
    const item =
      r.table === 'tasks'
        ? s.tasks.find((x) => x.id === r.id)?.title
        : r.table === 'habits'
          ? s.habits.find((x) => x.id === r.id)?.title
          : r.table === 'lists'
            ? s.lists.find((x) => x.id === r.id)?.name
            : s.sections.find((x) => x.id === r.id)?.name
    return t('sync.rejectedName', { name: (item || r.id).slice(0, 40) })
  })
  return {
    kind: 'rejected',
    count: rejected.length,
    detail: [t('sync.rejected', { count: rejected.length }), t('sync.rejectedItems', { names: names.join(' ') })].join('\n'),
  }
}
