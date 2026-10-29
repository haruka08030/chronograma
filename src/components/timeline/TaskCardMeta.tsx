import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { colorVars, labelForHex } from '../../lib/logCategoryColors'
import type { Task } from '../../types/task'
import { dueDateLabel } from '../ui/dueDateLabel'
import { DueChip } from '../ui/DueChip'
import { chipClass } from '../ui/chipClass'

/** カレンダーの To-Do のカードの締切・ラベル・タグの 1 行（To-Do の一覧の行と同じもの）。どれも無ければ何も出さない */
export function TaskCardMeta({ task }: { task: Task }) {
  const { t, i18n } = useTranslation()
  const presets = useTaskStore((s) => s.timeLogTagPresets)
  const colors = useTaskStore((s) => s.logCategoryColors)
  // 終えた To-Do の締切は何も変えないので出さない
  const due = task.dueDate && !task.completed ? dueDateLabel(task.dueDate, task.dueTime, t, i18n.resolvedLanguage) : null
  const label = labelForHex(task.color, presets, colors)
  if (!due && !label && task.tags.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      {due && <DueChip tone={due.tone} text={due.text} />}
      {label && (
        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300">
          <span className="gc-dot h-2 w-2 rounded-full" style={colorVars(task.color!)} aria-hidden />
          {label}
        </span>
      )}
      {task.tags.map((tag) => (
        <span key={tag} className={chipClass({ variant: 'fill' })}>
          {tag}
        </span>
      ))}
    </div>
  )
}
