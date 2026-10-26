import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { DUE_NOTIFY_OPTIONS, DUE_TITLE_MAX, daysBetween, nextDueDate, type DueItem, type DueRepeat } from '../../lib/dues'
import { newId } from '../../lib/id'
import { isSubmitEnter } from '../../lib/keyboard'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { useDateFormat } from '../../hooks/useDateFormat'
import { useDueWhenText } from '../../hooks/useDueWhenText'
import { Modal, ModalTitle } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { DateField } from '../DateField'
import { PlusIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { HINT_TEXT, META_TEXT } from '../ui/textClass'
import { useDialogDraft } from '../../hooks/useDialogDraft'

/**
 * 引き落とし・期限の日の一覧（#454、追加機能「引き落とし・期限」のページ）。次の日が近い順に並べ、押すと直す。＋ で足す。
 * 1 件は名前・日付・繰り返し（なし / 毎月 / 毎年）・何日前から今日の計画に出すか
 */
export function DuesBody() {
  const { t } = useTranslation()
  const df = useDateFormat()
  const today = useAppTodayKey()
  const dues = useTaskStore((s) => s.addons.dues)
  const when = useDueWhenText()
  const [editing, setEditing] = useState<DueItem | 'new' | null>(null)
  // 次の日が近い順。過ぎた 1 回きりのものは後ろ
  const rows = useMemo(
    () =>
      dues
        .map((item) => ({ item, next: nextDueDate(item, today) }))
        .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999') || a.item.title.localeCompare(b.item.title)),
    [dues, today],
  )

  return (
    <>
      {rows.length === 0 && <p className={`px-2 py-3 ${HINT_TEXT}`}>{t('dues.empty')}</p>}
      <ul>
        {rows.map(({ item, next }) => {
          const days = next ? daysBetween(today, next) : null
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setEditing(item)}
                className="flex w-full items-baseline gap-3 rounded-lg px-2 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-800 dark:text-zinc-100">{item.title}</span>
                  <span className={`block ${META_TEXT}`}>
                    {when(item)}
                    {item.notifyDays > 0 && ` · ${t('dues.notifyFrom', { count: item.notifyDays })}`}
                  </span>
                </span>
                <span className={`shrink-0 tabular-nums ${META_TEXT}`}>
                  {next === null
                    ? t('dues.passed')
                    : days === 0
                      ? t('dues.today')
                      : days === 1
                        ? t('dues.tomorrow')
                        : // 来年より先は年も
                          `${next.slice(0, 4) === today.slice(0, 4) ? df.monthDay(next) : df.fullDate(next)} · ${t('dues.daysLeft', { count: days ?? 0 })}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" onClick={() => setEditing('new')} className={buttonClass({ variant: 'ghost', size: 'sm' }, 'mt-1')}>
        <PlusIcon className="h-3.5 w-3.5" />
        {t('dues.add')}
      </button>
      {editing && <DueEditor item={editing === 'new' ? null : editing} today={today} onClose={() => setEditing(null)} />}
    </>
  )
}

/** 1 件を足す・直す。外側・Esc で閉じても書きかけは残す（`useDialogDraft`、1 件ごと）。保存・削除・キャンセルで捨てる */
function DueEditor({ item, today, onClose }: { item: DueItem | null; today: string; onClose: () => void }) {
  const { t } = useTranslation()
  const saveDue = useTaskStore((s) => s.saveDue)
  const deleteDue = useTaskStore((s) => s.deleteDue)
  const [draft, setDraft, discardDraft] = useDialogDraft(`due:${item?.id ?? 'new'}`, () => ({
    title: item?.title ?? '',
    date: item?.date ?? today,
    repeat: item?.repeat ?? ('none' as DueRepeat),
    notifyDays: item?.notifyDays ?? 1,
  }))
  const { title, date, repeat, notifyDays } = draft
  const patch = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }))
  const inputRef = useRef<HTMLInputElement>(null)

  const save = () => {
    const name = title.trim()
    if (!name || !date) return
    saveDue({ id: item?.id ?? newId(), title: name, date, repeat, notifyDays })
    discardDraft()
    onClose()
  }
  const cancel = () => {
    discardDraft()
    onClose()
  }

  return (
    <Modal onClose={onClose} labelledBy="due-editor-title" width="sm" className="p-5" initialFocus={inputRef}>
      <ModalTitle id="due-editor-title">{item ? t('dues.edit') : t('dues.add')}</ModalTitle>
      <label className="mt-4 block">
        <span className={sectionLabelClass('field', 'mb-1 block')}>{t('dues.name')}</span>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => patch({ title: e.target.value })}
          onKeyDown={(e) => {
            if (isSubmitEnter(e)) save()
          }}
          maxLength={DUE_TITLE_MAX}
          placeholder={t('dues.namePlaceholder')}
          className={fieldClass({}, 'w-full')}
        />
      </label>
      <div className="mt-3">
        <span className={sectionLabelClass('field', 'mb-1 block')}>{t('dues.repeat')}</span>
        <Segmented
          ariaLabel={t('dues.repeat')}
          value={repeat}
          onChange={(v) => patch({ repeat: v })}
          options={[
            { value: 'none', label: t('dues.repeatNone') },
            { value: 'monthly', label: t('dues.repeatMonthly') },
            { value: 'yearly', label: t('dues.repeatYearly') },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div>
          <span className={sectionLabelClass('field', 'mb-1 block')}>{repeat === 'none' ? t('dues.date') : t('dues.firstDate')}</span>
          <DateField value={date} onChange={(v) => patch({ date: v })} ariaLabel={t('dues.date')} className={fieldClass({ size: 'sm' })} />
        </div>
        <label>
          <span className={sectionLabelClass('field', 'mb-1 block')}>{t('dues.notify')}</span>
          <select value={notifyDays} onChange={(e) => patch({ notifyDays: Number(e.target.value) })} className={fieldClass({ size: 'sm' })}>
            {DUE_NOTIFY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? t('dues.notifySameDay') : t('dues.notifyFrom', { count: n })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-5 flex items-center gap-2">
        {item && (
          <button
            type="button"
            onClick={() => {
              deleteDue(item.id)
              discardDraft()
              onClose()
            }}
            className={buttonClass({ variant: 'danger', size: 'md' })}
          >
            {t('common.delete')}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={cancel} className={buttonClass({ variant: 'ghost', size: 'md' })}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={save} disabled={!title.trim() || !date} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
