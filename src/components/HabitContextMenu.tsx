import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { buildHabitRecordIndex, habitDayStatus } from '../lib/habitTiming'
import { appToday } from '../lib/timeZone'
import { toDateKey } from '../lib/dateKey'
import { ActionMenu, type ActionEntry } from './ui/ActionMenu'
import { ArchiveIcon, CheckIcon, PencilIcon, RestoreIcon, TrashIcon } from './icons'

const ICON = 'h-4 w-4 flex-shrink-0'

/**
 * 習慣のカードを右クリック（タッチは長押し）したときのメニュー（編集・今日の記録・アーカイブ・削除）。
 * アーカイブした習慣は「戻す」と削除だけ。削除は確認なしで消して「元に戻す」で戻せる
 */
export function HabitContextMenu({
  x,
  y,
  habitId,
  onClose,
  onEdit,
}: {
  x: number
  y: number
  habitId: string
  onClose: () => void
  onEdit: () => void
}) {
  const { t } = useTranslation()
  const habit = useTaskStore((s) => s.habits.find((h) => h.id === habitId) ?? null)
  const tasks = useTaskStore((s) => s.tasks)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const archiveHabit = useTaskStore((s) => s.archiveHabit)
  const restoreHabit = useTaskStore((s) => s.restoreHabit)
  const deleteHabit = useTaskStore((s) => s.deleteHabit)
  if (!habit) return null
  const remove: ActionEntry = {
    kind: 'leaf',
    id: 'delete',
    divider: true,
    label: t('common.delete'),
    icon: <TrashIcon className={ICON} />,
    danger: true,
    run: () => deleteHabit(habit.id),
  }
  let entries: ActionEntry[]
  if (habit.archivedAt) {
    entries = [
      {
        kind: 'leaf',
        id: 'restore',
        label: t('habits.restore'),
        icon: <RestoreIcon className={ICON} />,
        run: () => restoreHabit(habit.id),
      },
      remove,
    ]
  } else {
    const todayKey = toDateKey(appToday())
    // 時間外の記録も「付いている」（カードの丸・今日の計画と同じ）
    const doneToday = habitDayStatus(habit, todayKey, buildHabitRecordIndex(tasks)) !== 'missed'
    entries = [
      { kind: 'leaf', id: 'edit', label: t('common.edit'), icon: <PencilIcon className={ICON} strokeWidth={1.75} />, run: onEdit },
      {
        kind: 'leaf',
        id: 'today',
        label: doneToday ? t('habits.unmarkToday') : t('habits.markToday'),
        icon: <CheckIcon className={ICON} />,
        run: () => toggleHabitDate(habit.id, todayKey),
      },
      {
        kind: 'leaf',
        id: 'archive',
        label: t('habits.archive'),
        icon: <ArchiveIcon className={ICON} />,
        run: () => archiveHabit(habit.id),
      },
      remove,
    ]
  }
  return <ActionMenu x={x} y={y} header={habit.title} entries={entries} onClose={onClose} searchable={false} />
}
