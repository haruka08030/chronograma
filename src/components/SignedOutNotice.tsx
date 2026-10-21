import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useTaskStore } from '../store/taskStore'
import { cloudReady } from '../lib/cloudReady'
import { listAutoBackups, loadAutoBackup, type AutoBackupMeta } from '../lib/autoBackup'
import { clearSignedOutNotice, useSignedOutNotice } from '../lib/signedOutNotice'
import { notify } from '../lib/notify'
import { iconButtonClass } from './ui/iconButtonClass'
import { CloseIcon } from './icons'
import { tip } from '../lib/tooltip'

/** ログアウトの直前の控え（ログアウトを覚えた時刻の前後） */
const BACKUP_WINDOW_MS = 5 * 60_000

/**
 * 自分でログアウトしていないのにログアウトしたときの 1 行（#468）。前は何も言わずに画面が空になっていた。
 * - ログアウトしている間: 理由（期限切れ・アカウント削除）と、期限切れなら「ログインする」
 * - 同じ人がログインし直したら: クラウドの内容を取り込み終えてから、ログアウトの直前の控えから足りない分を戻すかを聞く
 */
export function SignedOutNotice() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const notice = useSignedOutNotice()
  const ready = useTaskStore((s) => cloudReady(s))
  const openSettingsWithScroll = useTaskStore((s) => s.openSettingsWithScroll)
  const restoreMissingFromBackup = useTaskStore((s) => s.restoreMissingFromBackup)
  const [backup, setBackup] = useState<AutoBackupMeta | null>(null)

  const sameUser = Boolean(user && notice && user.id === notice.userId)
  // 別の人がログインしたら、前の人の知らせは出さない
  useEffect(() => {
    if (user && notice && user.id !== notice.userId) clearSignedOutNotice()
  }, [user, notice])

  // ログインし直したら、ログアウトの直前の控えを探す。無ければ（削除・控えが取れていない）知らせを終える
  useEffect(() => {
    if (!sameUser || !notice || !ready) return
    let cancelled = false
    void listAutoBackups(notice.userId).then((all) => {
      if (cancelled) return
      const found = all.find((b) => b.kind === 'beforeSignOut' && Math.abs(Date.parse(b.savedAt) - notice.at) <= BACKUP_WINDOW_MS)
      if (found && notice.reason === 'expired') setBackup(found)
      else clearSignedOutNotice()
    })
    return () => {
      cancelled = true
    }
  }, [sameUser, notice, ready])

  if (!notice) return null
  const close = (
    <button
      type="button"
      onClick={clearSignedOutNotice}
      aria-label={t('common.close')}
      {...tip(t('common.close'))}
      className={iconButtonClass('p-1')}
    >
      <CloseIcon className="h-3.5 w-3.5" />
    </button>
  )
  const bar =
    'flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
  const action =
    'shrink-0 rounded-md px-1.5 py-0.5 font-medium text-accent-600 hover:bg-accent-50 dark:text-accent-400 dark:hover:bg-accent-500/10'

  if (!user) {
    return (
      <div role="status" className={bar}>
        <span className="min-w-0 flex-1">{t(notice.reason === 'deleted' ? 'signedOut.deleted' : 'signedOut.expired')}</span>
        {notice.reason === 'expired' && (
          <button type="button" className={action} onClick={() => openSettingsWithScroll('account')}>
            {t('signedOut.signIn')}
          </button>
        )}
        {close}
      </div>
    )
  }

  if (!sameUser || !backup) return null
  const restore = async () => {
    const full = await loadAutoBackup(backup.id, notice.userId)
    clearSignedOutNotice()
    const added = full ? restoreMissingFromBackup(full.json) : null
    // 戻せたときは store が「元に戻す」付きの通知を出す
    if (added === null) notify(t('autoBackup.unreadable'))
    else if (added === 0) notify(t('autoBackup.nothingMissing'))
  }
  return (
    <div role="status" className={bar}>
      <span className="min-w-0 flex-1">{t('signedOut.restoreAsk')}</span>
      <button type="button" className={action} onClick={() => void restore()}>
        {t('signedOut.restore')}
      </button>
      {close}
    </div>
  )
}
