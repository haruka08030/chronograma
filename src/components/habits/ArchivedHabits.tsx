import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Habit } from '../../types/habit'
import { colorVars } from '../../lib/logCategoryColors'
import { buttonClass } from '../ui/buttonClass'
import { DisclosureButton } from '../ui/Disclosure'
import { RestoreIcon } from '../icons'
import type { HabitMenuProps } from './useHabitMenu'

/** 習慣の画面の下の「アーカイブ N 件」（閉じた状態）。行の「戻す」と、右クリック（長押し）で戻す・削除 */
export function ArchivedHabits({
  habits,
  open,
  onToggle,
  menuProps,
}: {
  habits: Habit[]
  open: boolean
  onToggle: () => void
  menuProps: (habitId: string) => HabitMenuProps
}) {
  const { t } = useTranslation()
  const restoreHabit = useTaskStore((s) => s.restoreHabit)
  return (
    <section>
      <DisclosureButton tone="muted" open={open} onToggle={onToggle} className="-ml-3">
        {t('habits.archivedHeading', { count: habits.length })}
      </DisclosureButton>
      {open && (
        <ul className="mt-1 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {habits.map((h) => (
            <li key={h.id} {...menuProps(h.id)} className="flex select-none items-center gap-3 px-4 py-2.5">
              <span className="gc-dot h-2.5 w-2.5 shrink-0 rounded-full" style={colorVars(h.color)} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-600 dark:text-zinc-400">{h.title}</span>
              <button type="button" onClick={() => restoreHabit(h.id)} className={buttonClass({ variant: 'ghost', size: 'xs' })}>
                <RestoreIcon className="h-3.5 w-3.5" />
                {t('habits.restore')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
