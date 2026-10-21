import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { attendanceText, attendanceTone, classAttendance, isAbsent, isClassTask } from '../../lib/timetable'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { useAddonOn } from '../../hooks/useAddon'
import type { Task } from '../../types/task'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { buttonClass } from '../ui/buttonClass'

/**
 * 授業の予定のカードの欠席の数（#452）。休むかを決める前に見えるよう、これからの回にも出す。
 * 始まった回（今日まで）は「欠席にする」「欠席を取り消す」を押せる。時間割の授業でない予定・追加機能の時間割がオフなら何も出さない
 */
export function ClassAttendance({ task }: { task: Task }) {
  const { t } = useTranslation()
  const today = useAppTodayKey()
  const tasks = useTaskStore((s) => s.tasks)
  const timetable = useTaskStore((s) => s.timetable)
  const setClassAbsent = useTaskStore((s) => s.setClassAbsent)
  const on = useAddonOn('timetable')
  const isClass = on && isClassTask(task, timetable)
  const a = useMemo(() => (isClass ? classAttendance(tasks, timetable, task.title) : null), [isClass, tasks, timetable, task.title])
  if (!a || a.total === 0) return null
  const absent = isAbsent(timetable, task.title, task.scheduledDate!)
  const started = task.scheduledDate! <= today

  return (
    <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-4 py-2.5 dark:border-zinc-700">
      <p className={`text-sm tabular-nums ${DUE_TONE_CLASS[attendanceTone(a)]}`}>{attendanceText(a, t)}</p>
      {started && (
        <button
          type="button"
          aria-pressed={absent}
          onClick={() => setClassAbsent(task.id, !absent)}
          className={buttonClass({ variant: 'ghost', size: 'sm' }, 'shrink-0')}
        >
          {absent ? t('timetable.unmarkAbsent') : t('timetable.markAbsent')}
        </button>
      )}
    </div>
  )
}
