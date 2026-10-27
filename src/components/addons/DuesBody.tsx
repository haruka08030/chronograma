import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { DUE_NOTIFY_OPTIONS, DUE_TITLE_MAX, daysBetween, nextDueDate, type DueItem, type DueRepeat } from '../../lib/dues'
import { newId } from '../../lib/id'
import { isSubmitEnter } from '../../lib/keyboard'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { useDueDayText, useDueWhenText } from '../../hooks/useDueWhenText'
import { Modal, ModalTitle } from '../ui/Modal'
import { SettingsSubPage } from '../settings/SettingsSubPage'
import { Segmented } from '../ui/Segmented'
import { DateField } from '../DateField'
import { CalendarIcon, PlusIcon } from '../icons'
import { EmptyState } from '../ui/EmptyState'
import { ExampleChips } from '../ui/ExampleChips'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { META_TEXT } from '../ui/textClass'
import { useDialogDraft } from '../../hooks/useDialogDraft'
import { discardDialogDraft } from '../../lib/dialogDrafts'

/**
 * 引き落とし・期限の日の一覧（#454、追加機能「引き落とし・期限」のページ）。次の日が近い順に並べ、押すと編集、＋ で追加。
 * 1 件は名前・日付・繰り返し（なし / 毎月 / 毎年）・何日前から今日の計画に出すか
 */
export function DuesBody() {
  const { t } = useTranslation()
  const today = useAppTodayKey()
  const dues = useTaskStore((s) => s.addons.dues)
  const when = useDueWhenText()
  const dayText = useDueDayText()
  // 'new' は空から、{ title } は例を押して名前だけ入れた新しい 1 件
  const [editing, setEditing] = useState<DueItem | 'new' | { title: string } | null>(null)
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
      {rows.length === 0 && (
        // 例を押すとその名前で追加のカードが開く（日付・繰り返しを決めて保存）
        <EmptyState size="sm" icon={<CalendarIcon strokeWidth={1} />} title={t('dues.empty')}>
          <ExampleChips
            opensAdd
            examples={t('dues.examples', { returnObjects: true }) as string[]}
            onPick={(title) => {
              discardDialogDraft('due:new')
              setEditing({ title })
            }}
            className="mt-3 justify-center"
          />
        </EmptyState>
      )}
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
                <span className={`shrink-0 tabular-nums ${META_TEXT}`}>{dayText(next, days ?? 0, today)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" onClick={() => setEditing('new')} className={buttonClass({ variant: 'ghost', size: 'sm' }, 'mt-1')}>
        <PlusIcon className="h-3.5 w-3.5" />
        {t('dues.add')}
      </button>
      {editing && (
        <DueEditor
          item={editing === 'new' || !('id' in editing) ? null : editing}
          initialTitle={editing !== 'new' && !('id' in editing) ? editing.title : undefined}
          today={today}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

/** 1 件を追加・編集する。外側・Esc で閉じても書きかけは残す（`useDialogDraft`、1 件ごと）。保存・削除・キャンセルで捨てる */
function DueEditor({
  item,
  initialTitle,
  today,
  onClose,
}: {
  item: DueItem | null
  /** 例を押して開いたときの名前（押したときに新しい 1 件の書きかけは捨てる） */
  initialTitle?: string
  today: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const saveDue = useTaskStore((s) => s.saveDue)
  const deleteDue = useTaskStore((s) => s.deleteDue)
  const [draft, setDraft, discardDraft] = useDialogDraft(`due:${item?.id ?? 'new'}`, () => ({
    title: item?.title ?? initialTitle ?? '',
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

/** 追加機能「引き落とし・期限」のページ（上に「‹ 追加機能」） */
export function DuesPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <SettingsSubPage title={t('addons.dues.name')} backLabel={t('addons.title')} onBack={onBack}>
      <div className="-mx-2">
        <DuesBody />
      </div>
    </SettingsSubPage>
  )
}
