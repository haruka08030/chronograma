import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useTaskStore } from '../store/taskStore'
import { relativeSyncKey } from './syncIndicatorLabel'

/**
 * クラウド同期の状態。以前は失敗が console にしか出ず、預けたデータが
 * 届いているのか分からなかった。
 *
 * 原則「ごちゃつかせない」に従い、
 * - 成功している間は何も出さない（最後の同期時刻は title だけ）
 * - 送信中は小さなドットのみ
 * - 失敗している間だけ、未送信だと分かる 1 行を出す（消えると気づけないので自動では消さない）
 */
export function SyncIndicator() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const syncState = useTaskStore((s) => s.syncState)
  const lastSyncedAt = useTaskStore((s) => s.lastSyncedAt)
  /** 「3 分前」を据え置かないよう 1 分ごとに読み直す */
  const [now, setNow] = useState(() => Date.now())

  const showing = Boolean(user) && syncState !== 'idle'
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

  // 未ログイン（ローカル専用）では同期という概念が無いので出さない
  if (!showing) return null

  const last = lastSyncedAt ? relativeSyncKey(lastSyncedAt, now) : null
  const when = last ? t(last.key, { count: last.count }) : null

  if (syncState === 'syncing') {
    const title = when ? t('sync.syncingWithLast', { when }) : t('sync.syncing')
    return (
      <span className="flex shrink-0 items-center" title={title} aria-label={title} role="status">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 dark:bg-zinc-500" />
      </span>
    )
  }

  const detail = when ? t('sync.errorWithLast', { when }) : t('sync.error')

  return (
    <span
      className="flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-500"
      title={detail}
      role="status"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
      <span className="truncate text-[11px]">{t('sync.errorShort')}</span>
    </span>
  )
}
