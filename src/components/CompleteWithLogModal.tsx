import { useTranslation } from 'react-i18next'
import { TimeInput } from './TimeInput'

export type CompletionMode = 'as-planned' | 'shifted'

export interface CompleteWithLogDraft {
  taskId: string
  title: string
  date: string
  startTime: string
  endTime: string
  memo: string
  mode: CompletionMode
  tags: string[]
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" />
      <div
        className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{t('task.completeModal.title')}</h2>
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

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{t('common.start')}</label>
            <TimeInput
              value={draft.startTime}
              onChange={(v) => onChange({ startTime: v, mode: 'shifted' })}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{t('common.end')}</label>
            <TimeInput
              value={draft.endTime}
              onChange={(v) => onChange({ endTime: v, mode: 'shifted' })}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{t('task.completeModal.memo')}</label>
          <textarea
            value={draft.memo}
            onChange={(e) => onChange({ memo: e.target.value })}
            rows={4}
            placeholder={t('task.completeModal.memoPlaceholder')}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-500/40 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600"
          >
            {t('task.completeModal.saveComplete')}
          </button>
        </div>
      </div>
    </div>
  )
}
