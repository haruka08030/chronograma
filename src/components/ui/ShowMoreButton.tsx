import { useTranslation } from 'react-i18next'

/**
 * 長い一覧の終わりの「さらに表示」（検索・完了済み・ゴミ箱とアーカイブ・カレンダーのスケジュール）。
 * `remaining` を渡すと残りの件数も添える。一覧（listbox）の外に置く（行ではないので ↑↓ では止まらない。
 * ↓ で最後の行から先へ行くと足される: `useTaskListSelection` の `onShowMore`）
 */
export function ShowMoreButton({ onClick, remaining }: { onClick: () => void; remaining?: number }) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-center pt-3">
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        {remaining === undefined ? t('common.showMore') : t('common.showMoreCount', { count: remaining })}
      </button>
    </div>
  )
}
