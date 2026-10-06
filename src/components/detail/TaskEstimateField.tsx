import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import type { Task } from '../../types/task'
import { estimateOptionsWith } from '../../lib/estimate'
import { formatDuration } from '../../lib/timeGrid'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'

/** タスク詳細の見積もり（かかりそうな時間）。タイムラインに置く・時間を決めるときの長さになる */
export function TaskEstimateField({ task }: { task: Task }) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
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
    </div>
  )
}
