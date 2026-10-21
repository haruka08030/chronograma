import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useTaskStore } from '../store/taskStore'
import { useSyncProblem } from '../hooks/useSyncProblem'
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
 * 問題と説明の文はスマホの 1 行（MobileSyncNotice）と同じもの（`useSyncProblem`）
 */
export function SyncIndicator() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const syncState = useTaskStore((s) => s.syncState)
  const lastSyncedAt = useTaskStore((s) => s.lastSyncedAt)
  const problem = useSyncProblem()

  // すぐ終わる同期で点がチカッと出ないよう、0.4 秒以上かかっているときだけ出す
  const [slowSync, setSlowSync] = useState(false)
  /** 点を出したときの時刻（「最後の同期: 3 分前」に使う） */
  const [shownAt, setShownAt] = useState(0)
  useEffect(() => {
    if (syncState !== 'syncing') return
    const timer = setTimeout(() => {
      setShownAt(Date.now())
      setSlowSync(true)
    }, SLOW_SYNC_MS)
    return () => {
      clearTimeout(timer)
      setSlowSync(false)
    }
  }, [syncState])

  // 未ログイン（ローカル専用）では同期という概念が無いので出さない
  if (!user) return null

  if (syncState === 'syncing') {
    if (!slowSync) return null
    const last = lastSyncedAt ? relativeSyncKey(lastSyncedAt, shownAt) : null
    const when = last ? t(last.key, { count: last.count }) : null
    const title = when ? t('sync.syncingWithLast', { when }) : t('sync.syncing')
    return (
      <span className="flex shrink-0 items-center" {...tip(title)} aria-label={title} role="status">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 dark:bg-zinc-500" />
      </span>
    )
  }

  if (!problem) return null

  // アプリの版が同期の下限より古い: 送らずに止めている。押すと新しい版を読み込む
  if (problem.kind === 'outdated') {
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex shrink-0 items-center gap-1 rounded text-amber-600 hover:underline dark:text-amber-500"
        {...tip(problem.detail)}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
        <span className="truncate text-[11px]">{t('sync.outdatedShort')}</span>
      </button>
    )
  }

  const short = problem.kind === 'rejected' ? t('sync.rejectedShort', { count: problem.count }) : t('sync.errorShort')
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-500"
      {...(problem.kind === 'rejected' ? { title: problem.detail } : tip(problem.detail))}
      role="status"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
      <span className="truncate text-[11px]">{short}</span>
    </span>
  )
}
