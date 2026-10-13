import { useTranslation } from 'react-i18next'
import { TimeInput } from './TimeInput'
import { addClockMinutes } from '../lib/clockTime'
import { isCompleteDraftValid } from '../lib/completeWithLogDraft'
import { buttonClass } from './ui/buttonClass'
import { fieldClass } from './ui/fieldClass'
import { Modal, ModalTitle } from './ui/Modal'
import { DateField } from './DateField'
import { useTextAreaEntry } from '../hooks/useTextEntry'
import { SectionLabel } from './ui/SectionLabel'
import { sectionLabelClass } from './ui/sectionLabelClass'
import { ERROR_TEXT, HINT_TEXT } from './ui/textClass'
import { DESCRIPTION_MAX_LENGTH } from '../lib/textLimits'

export interface CompleteWithLogDraft {
  taskId: string
  title: string
  /** ログの開始日（`dueDate`） */
  date: string
  /** ログの終了日（`endDate`、開始と同じなら保存時は null） */
  endDate: string
  startTime: string
  endTime: string
  memo: string
  tags: string[]
  /** 元の To-Do の名前の無い色 */
  color: string | null
  /** 元が予定（完了の無いもの）。記録を作るだけで、完了にはしない */
  fromEvent?: boolean
}

export function CompleteWithLogModal({
  draft,
  onClose,
  onChange,
  onSubmit,
}: {
  draft: CompleteWithLogDraft
  onClose: () => void
  onChange: (patch: Partial<CompleteWithLogDraft>) => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  // メモは下書きにそのまま入る。⌘Enter / Esc は欄を離れるだけ（Esc でこのダイアログを閉じない）
  const memoEntry = useTextAreaEntry()
  const valid = isCompleteDraftValid(draft)
  const overnight = draft.endDate === draft.date && draft.endTime < draft.startTime
  return (
    <Modal onClose={onClose} labelledBy="complete-with-log-title" className="p-5">
      <ModalTitle id="complete-with-log-title">
        {t(draft.fromEvent ? 'task.completeModal.eventTitle' : 'task.completeModal.title')}
      </ModalTitle>
      <p className={`mt-1 ${HINT_TEXT}`}>{t(draft.fromEvent ? 'task.completeModal.eventBody' : 'task.completeModal.body')}</p>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 space-y-2 dark:border-zinc-700 dark:bg-zinc-900/40">
          <SectionLabel as="p" level="field">
            {t('common.start')}
          </SectionLabel>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex min-w-[10.5rem] flex-1 flex-col gap-1">
              <label className={sectionLabelClass('field')}>{t('task.completeModal.startDate')}</label>
              <DateField
                value={draft.date}
                onChange={(v) => onChange({ date: v, endDate: draft.endDate < v ? v : draft.endDate })}
                ariaLabel={t('task.completeModal.startDate')}
                className={fieldClass({}, 'w-full')}
              />
            </div>
            <div className="flex w-[7.5rem] shrink-0 flex-col gap-1">
              <label className={sectionLabelClass('field')}>{t('taskDetail.time')}</label>
              <TimeInput value={draft.startTime} onChange={(v) => onChange({ startTime: v })} className={fieldClass({}, 'w-full')} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 space-y-2 dark:border-zinc-700 dark:bg-zinc-900/40">
          <SectionLabel as="p" level="field">
            {t('common.end')}
          </SectionLabel>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex min-w-[10.5rem] flex-1 flex-col gap-1">
              <label className={sectionLabelClass('field')}>{t('task.completeModal.endDate')}</label>
              <DateField
                value={draft.endDate}
                min={draft.date}
                onChange={(v) => onChange({ endDate: v })}
                ariaLabel={t('task.completeModal.endDate')}
                className={fieldClass({}, 'w-full')}
              />
            </div>
            <div className="flex w-[7.5rem] shrink-0 flex-col gap-1">
              <label className={sectionLabelClass('field')}>{t('taskDetail.time')}</label>
              <TimeInput
                value={draft.endTime}
                onChange={(v) => onChange({ endTime: v })}
                pickerDefault={draft.startTime ? addClockMinutes(draft.startTime, 60) : undefined}
                className={fieldClass({}, 'w-full')}
              />
            </div>
          </div>
        </div>
      </div>

      {!valid ? (
        <p className={`mt-2 ${ERROR_TEXT}`}>{t('alert.endAfterStart')}</p>
      ) : (
        // 記録パネルと同じく、終了が開始より前なら翌日まで
        overnight && <p className={`mt-2 ${HINT_TEXT}`}>{t('records.nextDay')}</p>
      )}

      <div className="mt-4">
        <label className={sectionLabelClass('field', 'mb-1 block')}>{t('task.completeModal.memo')}</label>
        <textarea
          value={draft.memo}
          onChange={(e) => onChange({ memo: e.target.value })}
          maxLength={DESCRIPTION_MAX_LENGTH}
          {...memoEntry}
          rows={4}
          placeholder={t('task.completeModal.memoPlaceholder')}
          className={fieldClass({}, 'w-full')}
        />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClass({ variant: 'ghost', size: 'md' })}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={onSubmit} disabled={!valid} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t(draft.fromEvent ? 'task.completeModal.saveRecord' : 'task.completeModal.saveComplete')}
        </button>
      </div>
    </Modal>
  )
}
