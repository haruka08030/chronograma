import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { buttonClass } from '../ui/buttonClass'
import { CARD_TITLE_CLASS } from '../ui/headingClass'
import { HabitFormFields } from './HabitFormFields'
import { canSubmitHabitForm, habitFromForm, type HabitFormState } from './habitFormState'

/**
 * 習慣を追加するカード。中身は閉じても残す（名前だけ消す）ので、持ち主は習慣の画面。
 * 開いたら名前の欄にフォーカスし、足したら名前を空にして続けて書ける
 */
export function HabitComposer({
  form,
  onChange,
  onClose,
}: {
  form: HabitFormState
  onChange: (patch: Partial<HabitFormState>) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const addHabit = useTaskStore((s) => s.addHabit)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const submit = () => {
    if (!canSubmitHabitForm(form)) return
    addHabit(habitFromForm(form))
    onChange({ title: '' })
    queueMicrotask(() => titleRef.current?.focus())
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
      <h2 className={`mb-4 ${CARD_TITLE_CLASS}`}>{t('habits.newHabit')}</h2>
      <div className="space-y-3">
        <HabitFormFields
          form={form}
          onChange={onChange}
          name="new-habit"
          placeholder={t('habits.placeholderName')}
          onSubmit={submit}
          onEscape={onClose}
          titleRef={titleRef}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmitHabitForm(form)}
          className={buttonClass({ variant: 'primary', size: 'md' })}
        >
          {t('common.add')}
        </button>
      </div>
    </div>
  )
}
