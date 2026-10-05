import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useTaskStore } from '../store/taskStore'
import { relativeSyncKey } from './syncIndicatorLabel'
import { tip } from '../lib/tooltip'

const SLOW_SYNC_MS = 400

/**
 * クラウド同期の状態。以前は失敗が console にしか出ず、預けたデータが
 * 届いているのか分からなかった。
 *
 * 原則「ごちゃつかせない」に従い、
 * - 成功している間は何も出さない（最後の同期時刻は title だけ）
 * - 送信中は小さなドットのみ
 * - 失敗している間だけ、未送信だと分かる 1 行を出す（消えると気づけないので自動では消さない）
 * - 一部の行だけサーバーに拒否されたときは、その件数を出す（ほかの行は同期できている）
 */
export function SyncIndicator() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const syncState = useTaskStore((s) => s.syncState)
  const lastSyncedAt = useTaskStore((s) => s.lastSyncedAt)
  const rejected = useTaskStore((s) => s.syncRejected)
  /** 「3 分前」を据え置かないよう 1 分ごとに読み直す */
  const [now, setNow] = useState(() => Date.now())

  const showing = Boolean(user) && (syncState !== 'idle' || rejected.length > 0)
  // 表示に入った瞬間と 1 分ごとに読み直す。マウント時刻のまま据え置くと、
  // 長く開いたタブで「最後の同期」が実際より古く（または未来に）見える
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

  // すぐ終わる同期で点がチカッと出ないよう、0.4 秒以上かかっているときだけ出す
  const [slowSync, setSlowSync] = useState(false)
  useEffect(() => {
    if (syncState !== 'syncing') return
    const timer = setTimeout(() => setSlowSync(true), SLOW_SYNC_MS)
    return () => {
      clearTimeout(timer)
      setSlowSync(false)
    }
  }, [syncState])

  // 未ログイン（ローカル専用）では同期という概念が無いので出さない
  if (!showing) return null

  const last = lastSyncedAt ? relativeSyncKey(lastSyncedAt, now) : null
  const when = last ? t(last.key, { count: last.count }) : null

  if (syncState === 'syncing') {
    if (!slowSync) return null
    const title = when ? t('sync.syncingWithLast', { when }) : t('sync.syncing')
    return (
      <span className="flex shrink-0 items-center" {...tip(title)} aria-label={title} role="status">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 dark:bg-zinc-500" />
      </span>
    )
  }

  if (syncState === 'idle') {
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
    const title = [t('sync.rejected', { count: rejected.length }), t('sync.rejectedItems', { names: names.join(' ') })].join('\n')
    return (
      <span className="flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-500" title={title} role="status">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
        <span className="truncate text-[11px]">{t('sync.rejectedShort', { count: rejected.length })}</span>
      </span>
    )
  }

  // 行数の上限に達した: 接続が戻っても送れないので、消せば送れると伝える
  const detail = syncState === 'limit' ? t('sync.limit') : when ? t('sync.errorWithLast', { when }) : t('sync.error')

  return (
    <span className="flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-500" {...tip(detail)} role="status">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
      <span className="truncate text-[11px]">{t('sync.errorShort')}</span>
    </span>
  )
}
