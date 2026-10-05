import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Recurrence, Task } from '../../types/task'
import { RepeatWeekdays } from '../RepeatWeekdays'
import { RepeatIcon } from '../icons'
import { fieldClass } from '../ui/fieldClass'

const RECURRENCE_TYPES: (Recurrence['type'] | 'none')[] = ['none', 'daily', 'weekly', 'monthly', 'yearly']

/**
 * 繰り返し（締切のあるタスクだけ。完了すると次の締切で作り直す）。習慣とは別の「毎週の課題」など。
 * 毎週は曜日を選べる（Google カレンダーのカスタムの繰り返しと同じ）。既定は締切の曜日
 */
export function TaskRecurrenceField({ task, dueDate }: { task: Task; dueDate: string }) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
  return (
    <>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <RepeatIcon className={`h-3.5 w-3.5 shrink-0 ${task.recurrence ? 'text-zinc-600 dark:text-zinc-300' : ''}`} />
        <select
          aria-label={t('taskDetail.recurrence')}
          value={task.recurrence?.type ?? 'none'}
          onChange={(e) => {
            const val = e.target.value as Recurrence['type'] | 'none'
            if (val === 'none') {
              updateTask(task.id, { recurrence: null })
            } else {
              updateTask(task.id, {
                recurrence: { type: val, interval: task.recurrence?.interval ?? 1 },
              })
            }
          }}
          className={`rounded-md bg-transparent py-1 pl-1.5 text-xs [field-sizing:content] outline-none transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:ring-2 focus:ring-accent-500/40 ${
            task.recurrence ? 'text-zinc-800 dark:text-zinc-100' : ''
          }`}
        >
          {RECURRENCE_TYPES.map((r) => (
            <option key={r} value={r}>
              {r === 'none' ? t('taskDetail.recurrenceNone') : t(`taskDetail.recurrenceIntervals.${r}`)}
            </option>
          ))}
        </select>
        {task.recurrence && (
          <>
            <input
              type="number"
              min={1}
              aria-label={t('taskDetail.recurrenceEvery')}
              value={task.recurrence.interval}
              onChange={(e) => {
                const interval = Math.max(1, parseInt(e.target.value) || 1)
                updateTask(task.id, {
                  recurrence: { ...task.recurrence!, type: task.recurrence!.type, interval },
                })
              }}
              className={fieldClass({ size: 'sm' }, 'w-14 text-center')}
            />
            <span>{t(`taskDetail.recurrenceTypes.${task.recurrence.type}`)}</span>
          </>
        )}
      </div>
      {task.recurrence?.type === 'weekly' && (
        <RepeatWeekdays recurrence={task.recurrence} dueDate={dueDate} onChange={(recurrence) => updateTask(task.id, { recurrence })} />
      )}
    </>
  )
}
