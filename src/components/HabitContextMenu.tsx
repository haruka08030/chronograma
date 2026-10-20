import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { isHabitRestOn } from '../types/habit'
import { habitRestRunEnd } from '../lib/habitSchedule'
import { buildHabitRecordIndex, habitDayStatus } from '../lib/habitTiming'
import { appToday } from '../lib/timeZone'
import { habitSlotId, isPlacedPointHabitOn } from '../lib/habitSlots'
import { unplaceHabitSlot } from '../lib/timelineBlockEdit'
import { fromDateKey, toDateKey } from '../lib/dateKey'
import { useDateFormat } from '../hooks/useDateFormat'
import { ActionMenu, type ActionEntry } from './ui/ActionMenu'
import { MenuLabel } from './ui/Menu'
import { DatePickerBody } from './DatePickerBody'
import { ArchiveIcon, CalendarIcon, CheckIcon, ClockIcon, PencilIcon, RestoreIcon, TrashIcon } from './icons'

const ICON = 'h-4 w-4 flex-shrink-0'

/**
 * 習慣のカードを右クリック（タッチは長押し）したときのメニュー（編集・今日の記録・休み・アーカイブ・削除）。
 * 休みは日のマスで開いたらその日、行で開いたら今日から（その日だけ・カレンダーで選んだ日まで。休みの日なら「休みを外す」）。
 * アーカイブした習慣は「戻す」と削除だけ。削除は確認なしで消して「元に戻す」で戻せる
 */
export function HabitContextMenu({
  x,
  y,
  habitId,
  dateKey,
  onClose,
  onEdit,
  onTimeline = false,
}: {
  x: number
  y: number
  habitId: string
  /** 日のマスで開いた日。無ければ今日 */
  dateKey?: string | null
  onClose: () => void
  onEdit: () => void
  /** タイムラインの枠で開いた。格子に置いた時刻ひとつの習慣なら「習慣の段に戻す」を出す */
  onTimeline?: boolean
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const habit = useTaskStore((s) => s.habits.find((h) => h.id === habitId) ?? null)
  const tasks = useTaskStore((s) => s.tasks)
  const toggleHabitDate = useTaskStore((s) => s.toggleHabitDate)
  const archiveHabit = useTaskStore((s) => s.archiveHabit)
  const restoreHabit = useTaskStore((s) => s.restoreHabit)
  const deleteHabit = useTaskStore((s) => s.deleteHabit)
  const setHabitRest = useTaskStore((s) => s.setHabitRest)
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
    const day = dateKey ?? todayKey
    const rest: ActionEntry = isHabitRestOn(habit, day)
      ? {
          kind: 'leaf',
          id: 'rest',
          label: t('habits.restClear'),
          icon: <CalendarIcon className={ICON} />,
          hint: df.monthDayWeekday(day),
          run: () => setHabitRest(habit.id, day, habitRestRunEnd(habit, day), false),
        }
      : {
          kind: 'sub',
          id: 'rest',
          label: t('habits.rest'),
          icon: <CalendarIcon className={ICON} />,
          hint: df.monthDayWeekday(day),
          width: 'lg',
          leaves: [{ id: 'rest-day', label: t('habits.restOneDay'), run: () => setHabitRest(habit.id, day, day, true) }],
          extra: (close) => (
            <>
              <MenuLabel>{t('habits.restUntil')}</MenuLabel>
              <DatePickerBody
                footer={false}
                kind="date"
                value={null}
                min={day}
                month={fromDateKey(day)}
                onPick={(key) => {
                  if (key) setHabitRest(habit.id, day, key, true)
                  close()
                }}
              />
            </>
          ),
        }
    entries = [
      { kind: 'leaf', id: 'edit', label: t('common.edit'), icon: <PencilIcon className={ICON} strokeWidth={1.75} />, run: onEdit },
      {
        kind: 'leaf',
        id: 'today',
        label: doneToday ? t('habits.unmarkToday') : t('habits.markToday'),
        icon: <CheckIcon className={ICON} />,
        run: () => toggleHabitDate(habit.id, todayKey),
      },
      rest,
      ...(onTimeline && dateKey && isPlacedPointHabitOn(habit, dateKey)
        ? [
            {
              kind: 'leaf' as const,
              id: 'unplace',
              label: t('habits.unplace'),
              icon: <ClockIcon className={ICON} />,
              run: () => unplaceHabitSlot(habitSlotId(habit.id, dateKey)),
            },
          ]
        : []),
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
