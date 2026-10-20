import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { onPersistBlockedChange, persistBlocked } from '../lib/persistStorage'
import { UNREADABLE_COPY_PREFIX, latestStorageCopy } from '../lib/deviceCleanup'
import { downloadTextFile } from '../lib/downloadFile'
import { appTodayKey } from '../lib/timeZone'

/** 読めなかった保存データ（写し）をそのままファイルにする */
function exportUnreadableCopy() {
  const raw = latestStorageCopy(UNREADABLE_COPY_PREFIX)
  if (raw !== null) downloadTextFile(raw, `chronograma-saved-data-${appTodayKey()}.json`, 'application/json')
}

/**
 * 変更を保存できていないときのバナー。閉じるボタンは置かない（このまま再読み込みすると編集が消えるので、見えている必要がある）
 * - 端末の保存領域がいっぱい: 書き出しを促す
 * - 新しい版のアプリが書いたデータ（#485）: 保存を止めているので再読み込みを促す
 * - 保存データを読めなかった（#485）: 保存を止めているので、元のデータ（写し）の書き出しを促す
 */
export function StorageFullBanner() {
  const { t } = useTranslation()
  const storageFull = useTaskStore((s) => s.storageFull)
  const exportData = useTaskStore((s) => s.exportData)
  const blocked = useSyncExternalStore(onPersistBlockedChange, persistBlocked)
  if (!blocked && !storageFull) return null
  const [message, action, onAction] =
    blocked === 'newer'
      ? [t('storageFull.newer'), t('crash.reload'), () => window.location.reload()]
      : blocked === 'unreadable'
        ? [t('storageFull.unreadable'), t('storageFull.export'), exportUnreadableCopy]
        : [t('storageFull.message'), t('storageFull.export'), exportData]
  return (
    <div className="fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <div role="alert" className="flex max-w-xl items-center gap-3 rounded-xl bg-[#d93025] px-4 py-2.5 text-sm text-white shadow-lg">
        <span className="min-w-0">{message}</span>
        <button type="button" onClick={onAction} className="shrink-0 rounded-lg bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">
          {action}
        </button>
      </div>
    </div>
  )
}
