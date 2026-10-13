import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { EVENT_TEMPLATE_MAX, EVENT_TEMPLATE_TITLE_MAX, isValidTemplateRange, type EventTemplate } from '../../lib/eventTemplates'
import { newId } from '../../lib/id'
import { NEUTRAL_HEX } from '../../lib/googleColors'
import { isSubmitEnter } from '../../lib/keyboard'
import { tip } from '../../lib/tooltip'
import { addClockMinutes } from '../../lib/clockTime'
import { usePlanColorText } from '../../hooks/useTaskColor'
import { Modal, ModalTitle } from '../ui/Modal'
import { TimeInput } from '../TimeInput'
import { ColorLabelSelect } from '../labels/ColorLabelPicker'
import { PlusIcon, TrashIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { iconButtonClass } from '../ui/iconButtonClass'
import { ERROR_TEXT, HINT_TEXT } from '../ui/textClass'

/** 足したばかりの行の時刻（よくあるシフトの形。あとで変える） */
const NEW_START = '09:00'
const NEW_END = '17:00'

/** 1 行の時刻が使えるか（どちらも空でなく、終わりが始まりより後） */
const rangeOk = (r: EventTemplate) => isValidTemplateRange(r.startTime, r.endTime)

function TemplateRow({
  row,
  onChange,
  onRemove,
  onSubmit,
}: {
  row: EventTemplate
  onChange: (patch: Partial<EventTemplate>) => void
  onRemove: () => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  const defaultBlockMinutes = useTaskStore((s) => s.defaultBlockMinutes)
  const colorText = usePlanColorText(row.color)
  const invalid = Boolean(row.startTime && row.endTime) && !rangeOk(row)
  const timeClass = fieldClass({ size: 'sm' }, 'w-[5.5rem] tabular-nums')
  return (
    <li className="space-y-2 border-b border-zinc-100 pb-3 last:border-b-0 dark:border-zinc-700/60">
      <div className="flex items-center gap-2">
        <input
          data-template-row={row.id}
          value={row.title}
          onChange={(e) => onChange({ title: e.target.value })}
          onKeyDown={(e) => {
            if (isSubmitEnter(e)) onSubmit()
          }}
          maxLength={EVENT_TEMPLATE_TITLE_MAX}
          placeholder={t('eventTemplates.namePlaceholder')}
          aria-label={t('eventTemplates.nameAria')}
          className={fieldClass({ size: 'sm' }, 'min-w-0 flex-1')}
        />
        <button type="button" onClick={onRemove} {...tip(t('eventTemplates.remove'), { name: true })} className={iconButtonClass()}>
          <TrashIcon className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <TimeInput
            value={row.startTime}
            onChange={(v) => onChange({ startTime: v })}
            ariaLabel={t('eventTemplates.startAria')}
            className={timeClass}
          />
          <span className="text-zinc-400">{t('common.timeRangeSeparator')}</span>
          <TimeInput
            value={row.endTime}
            onChange={(v) => onChange({ endTime: v })}
            ariaLabel={t('eventTemplates.endAria')}
            pickerDefault={row.startTime ? addClockMinutes(row.startTime, defaultBlockMinutes) : undefined}
            className={timeClass}
          />
        </div>
        <ColorLabelSelect
          current={row.color}
          currentText={colorText}
          onChoose={(hex) => onChange({ color: hex })}
          defaultLabel={t('labels.none')}
          defaultHex={NEUTRAL_HEX}
          compact
        />
      </div>
      {invalid && (
        <p role="alert" className={ERROR_TEXT}>
          {t('eventTemplates.invalidRange')}
        </p>
      )}
    </li>
  )
}

/**
 * よく入れる予定の登録（#311）。ラベルの編集（`LabelsDialog`）と同じく、行を並べて ＋ で足し、保存でまとめて反映する。
 * 1 行は 名前・始まり〜終わり・ラベル（予定の色）。名前が空の行は保存しない
 */
export function EventTemplatesDialog({ onClose, onSaved }: { onClose: () => void; onSaved?: (templates: EventTemplate[]) => void }) {
  const { t } = useTranslation()
  const saved = useTaskStore((s) => s.eventTemplates)
  const saveEventTemplates = useTaskStore((s) => s.saveEventTemplates)
  // 初めて開いたときは空の行を 1 つ（何を書けばよいかが見える）
  const [rows, setRows] = useState<EventTemplate[]>(() =>
    saved.length > 0 ? saved : [{ id: newId(), title: '', startTime: NEW_START, endTime: NEW_END, color: null }],
  )
  const listRef = useRef<HTMLUListElement>(null)

  const patch = (id: string, p: Partial<EventTemplate>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const addRow = () => {
    const id = newId()
    setRows((rs) => [...rs, { id, title: '', startTime: NEW_START, endTime: NEW_END, color: null }])
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLInputElement>(`[data-template-row="${id}"]`)
      el?.scrollIntoView({ block: 'nearest' })
      el?.focus()
    })
  }

  // 名前のある行は時刻が使える形でないと保存できない（黙って消さない）
  const canSave = rows.every((r) => !r.title.trim() || rangeOk(r))
  const save = () => {
    if (!canSave) return
    saveEventTemplates(rows)
    onSaved?.(useTaskStore.getState().eventTemplates)
    onClose()
  }

  return (
    <Modal onClose={onClose} labelledBy="event-templates-title" className="flex max-h-[min(86vh,720px)] flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-6 pb-4 pt-6 dark:border-zinc-700">
        <ModalTitle id="event-templates-title">{t('eventTemplates.title')}</ModalTitle>
        <p className={`mt-1 ${HINT_TEXT}`}>{t('eventTemplates.intro')}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {rows.length === 0 ? (
          <p className={HINT_TEXT}>{t('eventTemplates.empty')}</p>
        ) : (
          <ul ref={listRef} className="space-y-3">
            {rows.map((r) => (
              <TemplateRow
                key={r.id}
                row={r}
                onChange={(p) => patch(r.id, p)}
                onRemove={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                onSubmit={save}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= EVENT_TEMPLATE_MAX}
          {...tip(t('eventTemplates.add'), { name: true })}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onClose} className={buttonClass({ variant: 'ghost', size: 'md' })}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={save} disabled={!canSave} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
