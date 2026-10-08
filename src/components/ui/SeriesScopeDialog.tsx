import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SERIES_SCOPES, type SeriesScope } from '../../lib/eventSeries'
import { Modal, ModalTitle } from './Modal'
import { PillToggle } from './PillToggle'
import { buttonClass } from './buttonClass'

/**
 * 毎週の予定を消すときに範囲を聞くダイアログ（Google カレンダーの「この予定 / これ以降のすべての予定 / すべての予定」）。
 * 見た目は確認のダイアログ（`ConfirmDialog`）と同じ。既定は「この予定のみ」。呼ぶのは `askSeriesScope()`（lib/seriesScope）
 */
export function SeriesScopeDialog({ title, onResult }: { title: string; onResult: (scope: SeriesScope | null) => void }) {
  const { t } = useTranslation()
  const titleId = useId()
  const [scope, setScope] = useState<SeriesScope>('one')
  const confirmRef = useRef<HTMLButtonElement>(null)
  return (
    <Modal onClose={() => onResult(null)} initialFocus={confirmRef} labelledBy={titleId} width="sm" className="p-5">
      <ModalTitle id={titleId}>{t('eventSeries.deleteTitle')}</ModalTitle>
      <p className="mt-2 break-words text-sm text-zinc-700 dark:text-zinc-300">{title}</p>
      <PillToggle
        ariaLabel={t('eventSeries.scopeAria')}
        options={SERIES_SCOPES.map((s) => ({ value: s, label: t(`eventSeries.scope.${s}`) }))}
        value={scope}
        onChange={setScope}
        className="mt-4"
      />
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={() => onResult(null)} className={buttonClass({ variant: 'ghost', size: 'md' })}>
          {t('common.cancel')}
        </button>
        <button ref={confirmRef} type="button" onClick={() => onResult(scope)} className={buttonClass({ variant: 'danger', size: 'md' })}>
          {t('common.delete')}
        </button>
      </div>
    </Modal>
  )
}
