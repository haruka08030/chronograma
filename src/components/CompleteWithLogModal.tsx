import { addDays } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { endDateFor, isCompleteDraftValid } from '../lib/completeWithLogDraft'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { buttonClass } from './ui/buttonClass'
import { fieldClass } from './ui/fieldClass'
import { Modal, ModalTitle } from './ui/Modal'
import { useTextAreaEntry } from '../hooks/useTextEntry'
import { useDateFormat } from '../hooks/useDateFormat'
import { ERROR_TEXT } from './ui/textClass'
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '../lib/textLimits'
import { LogTimeRow } from './LogTimeRow'
import { TimeLogTagField } from './TimeLogTagField'

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

/**
 * 通知の「記録する」で開く、予定を記録にするフォーム。記録パネルの「後から記録」と同じ形
 * （題名・時刻 1 行・日をまたぐときだけ「翌日まで」・ラベルのチップ）。ラベルの初期値は元の To-Do・予定のラベル
 */
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
  const df = useDateFormat()
  // メモは下書きにそのまま入る。⌘Enter / Esc は欄を離れるだけ（Esc でこのダイアログを閉じない）
  const memoEntry = useTextAreaEntry()
  const valid = isCompleteDraftValid(draft)
  const nextDay = toDateKey(addDays(fromDateKey(draft.date), 1))
  const setTimes = (startTime: string, endTime: string) =>
    onChange({ startTime, endTime, endDate: endDateFor(draft.date, startTime, endTime) })
  return (
    <Modal onClose={onClose} labelledBy="complete-with-log-title" className="p-5">
      <ModalTitle id="complete-with-log-title">
        {t(draft.fromEvent ? 'task.completeModal.eventTitle' : 'task.completeModal.title')}
      </ModalTitle>

      <div className="mt-4 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
        <input
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          maxLength={TITLE_MAX_LENGTH}
          aria-label={t('records.laterPlaceholder')}
          placeholder={t('records.laterPlaceholder')}
          className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
        />
        <LogTimeRow
          start={draft.startTime}
          end={draft.endTime}
          onStartChange={(v) => setTimes(v, draft.endTime)}
          onEndChange={(v) => setTimes(draft.startTime, v)}
        >
          {!valid ? (
            <span className={ERROR_TEXT}>{t('alert.endAfterStart')}</span>
          ) : (
            draft.endDate !== draft.date && (
              <span className="text-xs">
                {draft.endDate === nextDay ? t('records.nextDay') : t('records.untilDate', { date: df.shortDateWeekday(draft.endDate) })}
              </span>
            )
          )}
        </LogTimeRow>
        <TimeLogTagField value={draft.tags[0] ?? ''} color={draft.color} onChange={onChange} compact />
        <textarea
          value={draft.memo}
          onChange={(e) => onChange({ memo: e.target.value })}
          maxLength={DESCRIPTION_MAX_LENGTH}
          {...memoEntry}
          rows={2}
          aria-label={t('task.completeModal.memo')}
          placeholder={t('task.completeModal.memo')}
          className={fieldClass({ size: 'sm' }, 'w-full')}
        />
      </div>

      <div className="mt-4 flex justify-end gap-2">
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
