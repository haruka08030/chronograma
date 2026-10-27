import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { emptyTerm, overlapsTerm, suggestNextTerm, TERM_NAME_MAX, withTerm, withoutTerm, type Term } from '../../lib/schoolTerms'
import { newId } from '../../lib/id'
import { tip } from '../../lib/tooltip'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { useSchool } from '../../hooks/useSchool'
import { useDialogDraft } from '../../hooks/useDialogDraft'
import { useTermLabel } from '../../hooks/useTermLabel'
import { Modal, ModalTitle } from '../ui/Modal'
import { DateField } from '../DateField'
import { PencilIcon, PlusIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { iconButtonClass } from '../ui/iconButtonClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { ERROR_TEXT, HINT_TEXT } from '../ui/textClass'

/**
 * 学校の学期の行（#622）。学期を選ぶ・直す・足す。学期が無ければ「学期を追加」だけ。
 * 学校のページと週表示の時間割のダイアログで同じものを使う
 */
export function SchoolTermBar({ term, onSelect }: { term: Term | null; onSelect: (id: string) => void }) {
  const { t } = useTranslation()
  const school = useSchool()
  const label = useTermLabel()
  const [editing, setEditing] = useState<Term | 'new' | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {term ? (
        <>
          <select
            value={term.id}
            onChange={(e) => onSelect(e.target.value)}
            aria-label={t('school.selectTermAria')}
            className={fieldClass({ size: 'sm' }, 'max-w-full')}
          >
            {school.terms.map((x) => (
              <option key={x.id} value={x.id}>
                {label(x)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setEditing(term)}
            {...tip(t('school.editTerm'), { name: true })}
            className={iconButtonClass()}
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        </>
      ) : (
        <p className={HINT_TEXT}>{t('school.noTerms')}</p>
      )}
      <button type="button" onClick={() => setEditing('new')} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
        <PlusIcon className="h-3.5 w-3.5" />
        {t('school.addTerm')}
      </button>
      {editing && (
        <TermEditor
          term={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            onSelect(id)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * 学期の名前・期間を決める。ほかの学期と重なれば保存しない。消すとその学期の欠席・追加した授業も消える（時間割の予定は残る）。
 * 消すのは確認なしで「元に戻す」付き。外側・Esc で閉じても書きかけは残す（`useDialogDraft`、学期ごと）。保存・削除・キャンセルで捨てる
 */
function TermEditor({ term, onClose, onSaved }: { term: Term | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { t } = useTranslation()
  const today = useAppTodayKey()
  const school = useSchool()
  const saveSchool = useTaskStore((s) => s.saveSchool)
  const label = useTermLabel()
  const suggestion = term ?? suggestNextTerm(school, today)
  const [draft, setDraft, discardDraft] = useDialogDraft(`school-term:${term?.id ?? 'new'}`, () => ({
    name: term?.name ?? '',
    termStart: suggestion.termStart as string | null,
    termEnd: suggestion.termEnd as string | null,
  }))
  const { name, termStart, termEnd } = draft
  const patch = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }))
  const inputRef = useRef<HTMLInputElement>(null)
  const range = termStart && termEnd ? { termStart, termEnd } : null
  const bad = !!range && range.termStart > range.termEnd
  const overlap = !!range && !bad && overlapsTerm(school, range, term?.id ?? null)
  const canSave = !!range && !bad && !overlap

  const save = () => {
    if (!range || !canSave) return
    const id = term?.id ?? newId()
    saveSchool(withTerm(school, { ...(term ?? emptyTerm(id, range)), name: name.trim(), ...range }))
    discardDraft()
    onSaved(id)
  }
  const remove = () => {
    if (!term) return
    saveSchool(withoutTerm(school, term.id), { key: 'undo.termDeleted', params: { name: label(term) } })
    discardDraft()
    onClose()
  }
  const cancel = () => {
    discardDraft()
    onClose()
  }

  return (
    <Modal onClose={onClose} labelledBy="school-term-title" width="sm" className="p-5" initialFocus={inputRef}>
      <ModalTitle id="school-term-title">{term ? t('school.editTerm') : t('school.addTerm')}</ModalTitle>
      <label className="mt-4 block">
        <span className={sectionLabelClass('field', 'mb-1 block')}>{t('school.termName')}</span>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => patch({ name: e.target.value })}
          maxLength={TERM_NAME_MAX}
          placeholder={t('school.termNamePlaceholder')}
          className={fieldClass({}, 'w-full')}
        />
      </label>
      <div className="mt-3">
        <p className={sectionLabelClass('field', 'mb-1 block')}>{t('timetable.term')}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <DateField
            value={termStart}
            onChange={(v) => patch({ termStart: v })}
            ariaLabel={t('timetable.termStart')}
            className={fieldClass({ size: 'sm' })}
          />
          <span className="text-zinc-400">{t('common.timeRangeSeparator')}</span>
          <DateField
            value={termEnd}
            min={termStart ?? undefined}
            onChange={(v) => patch({ termEnd: v })}
            ariaLabel={t('timetable.termEnd')}
            className={fieldClass({ size: 'sm' })}
          />
        </div>
        {bad && (
          <p role="alert" className={`mt-1 ${ERROR_TEXT}`}>
            {t('timetable.termInvalid')}
          </p>
        )}
        {overlap && (
          <p role="alert" className={`mt-1 ${ERROR_TEXT}`}>
            {t('school.termOverlap')}
          </p>
        )}
      </div>
      <div className="mt-5 flex items-center gap-2">
        {term && (
          <button type="button" onClick={remove} className={buttonClass({ variant: 'danger', size: 'md' })}>
            {t('school.deleteTerm')}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={cancel} className={buttonClass({ variant: 'ghost', size: 'md' })}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={save} disabled={!canSave} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
