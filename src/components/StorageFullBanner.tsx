import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'

/**
 * 端末の保存領域がいっぱいで変更を保存できていないとき。閉じるボタンは置かない
 * （このまま再読み込みすると編集が消えるので、書き出すまで見えている必要がある）
 */
export function StorageFullBanner() {
  const { t } = useTranslation()
  const storageFull = useTaskStore((s) => s.storageFull)
  const exportData = useTaskStore((s) => s.exportData)
  if (!storageFull) return null
  return (
    <div className="fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <div
        role="alert"
        className="flex max-w-xl items-center gap-3 rounded-xl bg-[#d93025] px-4 py-2.5 text-sm text-white shadow-lg"
      >
        <span className="min-w-0">{t('storageFull.message')}</span>
        <button
          type="button"
          onClick={exportData}
          className="shrink-0 rounded-lg bg-white/15 px-3 py-1 font-semibold hover:bg-white/25"
        >
          {t('storageFull.export')}
        </button>
      </div>
    </div>
  )
}
