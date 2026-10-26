import { useTranslation } from 'react-i18next'
import type { Habit } from '../../types/habit'
import { colorVars } from '../../lib/logCategoryColors'
import { useHabitGoalText } from './useHabitGoalText'
import type { HabitMenuProps } from './useHabitMenu'

/**
 * 習慣の画面の「ルーティン」: 行＝ルーティン（色・名前・やる日と時間帯）。達成を数えないので週の表・直近 4 週には入れない。
 * 行を押すと詳細（いつもの時間からのずれ）、右クリック（長押し）で習慣と同じメニュー
 */
export function RoutineList({
  routines,
  menuProps,
  onOpen,
  addedId,
}: {
  routines: Habit[]
  menuProps: (habitId: string) => HabitMenuProps
  onOpen: (habit: Habit) => void
  addedId: string | null
}) {
  const { t } = useTranslation()
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('habits.routinesTitle')}</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('habits.routinesHint')}</p>
      </div>
      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {routines.map((h) => (
          <RoutineRow key={h.id} habit={h} menuProps={menuProps(h.id)} onOpen={() => onOpen(h)} added={h.id === addedId} />
        ))}
      </ul>
    </section>
  )
}

function RoutineRow({
  habit: h,
  menuProps,
  onOpen,
  added,
}: {
  habit: Habit
  menuProps: HabitMenuProps
  onOpen: () => void
  added: boolean
}) {
  const goalText = useHabitGoalText(h)
  return (
    <li {...menuProps} data-habit-row={h.id} className={`select-none ${added ? 'animate-sheet-in' : ''}`}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <span className="gc-dot h-2.5 w-2.5 shrink-0 rounded-full" style={colorVars(h.color)} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-900 dark:text-zinc-100">{h.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{goalText}</span>
      </button>
    </li>
  )
}
