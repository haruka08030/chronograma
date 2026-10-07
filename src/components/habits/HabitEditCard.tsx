import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Habit } from '../../types/habit'
import { ICON_PATHS } from '../../lib/iconPaths'
import { tip } from '../../lib/tooltip'
import { PathIcon } from '../PathIcon'
import { buttonClass } from '../ui/buttonClass'
import { iconButtonClass } from '../ui/iconButtonClass'
import { CARD_TITLE_CLASS } from '../ui/headingClass'
import { HabitFormFields } from './HabitFormFields'
import { canSubmitHabitForm, habitFormFrom, habitFromForm, useHabitForm } from './habitFormState'

/** 習慣のカードを押したときの編集カード（その場で入れ替わる）。中身は開いたときの習慣の値から始める */
export function HabitEditCard({ habit, offDay, onClose }: { habit: Habit; offDay: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const updateHabit = useTaskStore((s) => s.updateHabit)
  const deleteHabit = useTaskStore((s) => s.deleteHabit)
  const [form, patch] = useHabitForm(() => habitFormFrom(habit))
  const disabled = !canSubmitHabitForm(form)

  const save = () => {
    if (!canSubmitHabitForm(form)) return
    updateHabit(habit.id, habitFromForm(form))
    onClose()
  }

  return (
    <li>
      <div
        className={`overflow-hidden rounded-xl border border-accent-400/60 bg-white dark:border-accent-500/40 dark:bg-zinc-900/40 ${offDay ? 'ring-1 ring-zinc-300/40 dark:ring-zinc-600/40' : ''}`}
      >
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className={CARD_TITLE_CLASS}>{t('habits.editTitle')}</h3>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                deleteHabit(habit.id)
                onClose()
              }}
              className={iconButtonClass('-mr-1.5 -mt-1.5')}
              {...tip(t('common.delete'), { name: true })}
            >
              <PathIcon d={ICON_PATHS.trash} className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
          <HabitFormFields
            form={form}
            onChange={patch}
            name="edit-habit"
            placeholder={t('habits.nameShort')}
            onSubmit={() => {
              if (!disabled) save()
            }}
            onEscape={onClose}
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={save} disabled={disabled} className={buttonClass({ variant: 'primary', size: 'md' })}>
              {t('common.save')}
            </button>
            <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', size: 'md' })}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}
