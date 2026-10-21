import { useMemo, useState } from 'react'
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
import { EstimateBiasHint } from '../EstimateBiasHint'
import { endWithinDay } from '../../lib/clockTime'
import { useTaskTimes } from './useTaskTimes'

/** タスク詳細の見積もり（かかりそうな時間）。タイムラインに置く・時間を決めるときの長さになる */
export function TaskEstimateField({ task }: { task: Task }) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
  const tasks = useTaskStore((s) => s.tasks)
  const todayKey = useAppTodayKey()
  const { tv, updateTimes } = useTaskTimes(task)
  /** 見積もりを変える。時刻のある完了前の To-Do は、終わりも開始＋見積もりにする（タイムラインの枠の長さ） */
  const setEstimate = (m: number | null) => {
    if (m != null && !task.completed && tv.startTime && tv.endTime) {
      updateTimes({ endTime: endWithinDay(tv.startTime, m) }, { estimateMinutes: m })
    } else updateTask(task.id, { estimateMinutes: m })
  }
  // 見積もりを選んだ直後だけクセを添える（開くたび・直した後には出さない）
  const [justPicked, setJustPicked] = useState<number | null>(null)
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
        onChange={(e) => {
          const m = e.target.value === '' ? null : Number(e.target.value)
          setEstimate(m)
          setJustPicked(m)
        }}
        className={fieldClass({}, 'w-[10rem]')}
      >
        <option value="">{t('taskDetail.estimateNone')}</option>
        {estimateOptionsWith(task.estimateMinutes).map((m) => (
          <option key={m} value={m}>
            {formatDuration(m)}
          </option>
        ))}
      </select>
      {/* やる前の To-Do だけ、見積もりのクセを添える（#417。決める前に見る） */}
      {!task.completed && justPicked != null && justPicked === task.estimateMinutes && (
        <EstimateBiasHint
          minutes={justPicked}
          labelId={task.labelId ?? null}
          onApply={(m) => {
            setEstimate(m)
            setJustPicked(null)
          }}
          className="mt-1.5"
        />
      )}
      {logged > 0 && (
        <p className={`mt-1.5 tabular-nums ${META_TEXT}`}>{t('taskDetail.estimateLogged', { time: formatDuration(logged) })}</p>
      )}
    </div>
  )
}
