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

export type CompletionMode = 'as-planned' | 'shifted'

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
  mode: CompletionMode
  tags: string[]
  /** 元の To-Do の名前の無い色 */
  color: string | null
}

export function CompleteWithLogModal({
  draft,
  radioGroupName,
  onClose,
  onChange,
  onSubmit,
}: {
  draft: CompleteWithLogDraft
  /** 同一ページに複数インスタンスがないよう、呼び出し側で一意の name を渡す */
  radioGroupName: string
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
        <ModalTitle id="complete-with-log-title">{t('task.completeModal.title')}</ModalTitle>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {t('task.completeModal.body')}
        </p>

        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={radioGroupName}
              checked={draft.mode === 'as-planned'}
              onChange={() => onChange({ mode: 'as-planned' })}
            />
            <span className="text-zinc-700 dark:text-zinc-300">{t('task.completeModal.asPlanned')}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={radioGroupName}
              checked={draft.mode === 'shifted'}
              onChange={() => onChange({ mode: 'shifted' })}
            />
            <span className="text-zinc-700 dark:text-zinc-300">{t('task.completeModal.shifted')}</span>
          </label>
        </div>

        <div className="mt-4 space-y-3">
          <div
            className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 space-y-2 dark:border-zinc-700 dark:bg-zinc-900/40"
          >
            <SectionLabel as="p" level="field">{t('common.start')}</SectionLabel>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex min-w-[10.5rem] flex-1 flex-col gap-1">
                <label className={sectionLabelClass('field')}>
                  {t('task.completeModal.startDate')}
                </label>
                <DateField
                  value={draft.date}
                  onChange={(v) => onChange({ date: v, endDate: draft.endDate < v ? v : draft.endDate, mode: 'shifted' })}
                  ariaLabel={t('task.completeModal.startDate')}
                  className={fieldClass({}, 'w-full')}
                />
              </div>
              <div className="flex w-[7.5rem] shrink-0 flex-col gap-1">
                <label className={sectionLabelClass('field')}>
                  {t('taskDetail.time')}
                </label>
                <TimeInput
                  value={draft.startTime}
                  onChange={(v) => onChange({ startTime: v, mode: 'shifted' })}
                  className={fieldClass({}, 'w-full')}
                />
              </div>
            </div>
          </div>

          <div
            className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 space-y-2 dark:border-zinc-700 dark:bg-zinc-900/40"
          >
            <SectionLabel as="p" level="field">{t('common.end')}</SectionLabel>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex min-w-[10.5rem] flex-1 flex-col gap-1">
                <label className={sectionLabelClass('field')}>
                  {t('task.completeModal.endDate')}
                </label>
                <DateField
                  value={draft.endDate}
                  min={draft.date}
                  onChange={(v) => onChange({ endDate: v, mode: 'shifted' })}
                  ariaLabel={t('task.completeModal.endDate')}
                  className={fieldClass({}, 'w-full')}
                />
              </div>
              <div className="flex w-[7.5rem] shrink-0 flex-col gap-1">
                <label className={sectionLabelClass('field')}>
                  {t('taskDetail.time')}
                </label>
                <TimeInput
                  value={draft.endTime}
                  onChange={(v) => onChange({ endTime: v, mode: 'shifted' })}
                  pickerDefault={draft.startTime ? addClockMinutes(draft.startTime, 60) : undefined}
                  className={fieldClass({}, 'w-full')}
                />
              </div>
            </div>
          </div>
        </div>

        {!valid ? (
          <p className="mt-2 text-xs text-red-500 dark:text-red-400">{t('alert.endAfterStart')}</p>
        ) : (
          // 記録パネルと同じく、終了が開始より前なら翌日まで
          overnight && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{t('records.nextDay')}</p>
        )}

        <div className="mt-4">
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{t('task.completeModal.memo')}</label>
          <textarea
            value={draft.memo}
            onChange={(e) => onChange({ memo: e.target.value })}
            {...memoEntry}
            rows={4}
            placeholder={t('task.completeModal.memoPlaceholder')}
            className={fieldClass({}, 'w-full')}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={buttonClass({ variant: 'ghost', size: 'md' })}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!valid}
            className={buttonClass({ variant: 'primary', size: 'md' })}
          >
            {t('task.completeModal.saveComplete')}
          </button>
        </div>
    </Modal>
  )
}
