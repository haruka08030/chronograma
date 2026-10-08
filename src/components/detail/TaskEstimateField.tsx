import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { estimateOptionsWith } from '../../lib/estimate'
import { formatDuration } from '../../lib/timeGrid'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { META_TEXT } from '../ui/textClass'
import { loggedMinutesForTask } from '../../lib/estimateActual'
import { useAppTodayKey } from '../../hooks/useAppClock'

/** タスク詳細の見積もり（かかりそうな時間）。タイムラインに置く・時間を決めるときの長さになる */
export function TaskEstimateField({ task }: { task: Task }) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
  const tasks = useTaskStore((s) => s.tasks)
  const todayKey = useAppTodayKey()
  // 完了した To-Do だけ、結び付いた記録の合計を見積もりの下に添える（#297。決めた後に見る。やる前の To-Do には出さない）
  const logged = useMemo(
    () => (task.completed ? loggedMinutesForTask(tasks, task.id, todayKey) : 0),
    [task.completed, task.id, tasks, todayKey],
  )
  return (
    <div>
      <label htmlFor={`estimate-${task.id}`} className={sectionLabelClass('field', 'mb-2 block')}>
        {t('taskDetail.estimate')}
      </label>
      <select
        id={`estimate-${task.id}`}
        value={task.estimateMinutes ?? ''}
        onChange={(e) => updateTask(task.id, { estimateMinutes: e.target.value === '' ? null : Number(e.target.value) })}
        className={fieldClass({}, 'w-[10rem]')}
      >
        <option value="">{t('taskDetail.estimateNone')}</option>
        {estimateOptionsWith(task.estimateMinutes).map((m) => (
          <option key={m} value={m}>
            {formatDuration(m)}
          </option>
        ))}
      </select>
      {logged > 0 && (
        <p className={`mt-1.5 tabular-nums ${META_TEXT}`}>{t('taskDetail.estimateLogged', { time: formatDuration(logged) })}</p>
      )}
    </div>
  )
}
