import { useTranslation } from 'react-i18next'
import type { Task } from '../../types/task'
import { tip } from '../../lib/tooltip'
import { dueToneOf } from '../../lib/dueTone'
import { DueIcon } from '../icons'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { DAY_ROW_PAD_CLASS, DAY_ROW_TIME_CLASS } from '../ui/DayRow'

/**
 * 締切の日の印（実行日が別の日の未完了の To-Do、`dueMarkDayKey`）。塗らずに締切の色の文字と →| だけ（置いた日のチップと見分ける）。
 * どの表示（週・3 日の終日の行・月のマス・スケジュール・日のパネル）でも押すとその To-Do のカード（`openCard`）。
 * - xs: 終日の行・月のマスの 10px の行
 * - sm: スケジュール・日のパネルの 1 行（`DayRow` と同じ時刻の列と高さ。時刻の列は締切の時刻か「締切」）
 */
export function TaskDueMark({
  task,
  dateKey,
  size = 'xs',
  onOpen,
  cellOpen = false,
}: {
  task: Pick<Task, 'id' | 'title' | 'dueDate' | 'dueTime'>
  dateKey: string
  size?: 'xs' | 'sm'
  onOpen: (taskId: string, el: Element) => void
  /** 月のマス: スマホ幅で押したらマスと同じくその日を開く（小さくて押し分けにくいので。`data-cell-open`） */
  cellOpen?: boolean
}) {
  const { t } = useTranslation()
  const label = task.dueTime
    ? t('weekCalendar.dueMarkTime', { title: task.title, time: task.dueTime })
    : t('weekCalendar.dueMark', { title: task.title })
  const tone = DUE_TONE_CLASS[dueToneOf(task.dueDate!, task.dueTime, dateKey)]
  if (size === 'sm')
    return (
      <button
        type="button"
        data-due-mark-task={task.id}
        onClick={(e) => onOpen(task.id, e.currentTarget)}
        aria-label={label}
        className={`flex w-full items-center gap-2 rounded-xl text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${DAY_ROW_PAD_CLASS}`}
      >
        <span className={DAY_ROW_TIME_CLASS}>{task.dueTime ?? t('common.due')}</span>
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${tone}`}>
          <DueIcon className="h-3.5 w-3.5" />
        </span>
        <span className={`min-w-0 flex-1 truncate text-sm ${tone}`}>{task.title}</span>
      </button>
    )
  return (
    <button
      type="button"
      data-due-mark-task={task.id}
      data-cell-open={cellOpen || undefined}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(task.id, e.currentTarget)
      }}
      {...tip(label, { name: true })}
      className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] leading-tight hover:bg-zinc-100 dark:hover:bg-zinc-800 ${tone}`}
    >
      <DueIcon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{task.dueTime ? `${task.dueTime} ${task.title}` : task.title}</span>
    </button>
  )
}
