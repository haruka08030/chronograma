import { useTranslation } from 'react-i18next'
import { PlayIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'

/**
 * 予定のカードの操作の行（記録して完了 / 記録にする・完了・▶ 記録を開始）。題名・時刻のすぐ下に置く。
 * アプリの予定・To-Do（`EventPopover`）と Google の予定（`GoogleEventPopover`）で同じものを使う
 */
export function CardActions({
  record,
  complete,
  onStart,
  startDisabled = false,
}: {
  /** 始まった予定を記録にする（主役のボタン） */
  record?: { label: string; onClick: () => void }
  /** 完了にする・戻す。`record` があれば控えめに */
  complete?: { label: string; onClick: () => void }
  /** 記録を開始（終わった予定・完了したものには渡さない） */
  onStart?: () => void
  /** 同じものを記録中 */
  startDisabled?: boolean
}) {
  const { t } = useTranslation()
  if (!record && !complete && !onStart) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {record && (
        <button type="button" onClick={record.onClick} className={buttonClass({ variant: 'primary', size: 'sm' })}>
          {record.label}
        </button>
      )}
      {complete && (
        <button type="button" onClick={complete.onClick} className={buttonClass({ variant: record ? 'secondary' : 'primary', size: 'sm' })}>
          {complete.label}
        </button>
      )}
      {onStart && (
        // 記録中でも押せる（前の記録を保存して切り替える）
        <button type="button" disabled={startDisabled} onClick={onStart} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          <PlayIcon className="h-3 w-3" />
          {t('eventCard.startLog')}
        </button>
      )}
    </div>
  )
}
