import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { attendanceText, attendanceTone } from '../../lib/timetable'
import { courseAttendance, isAbsent, isClassTask, isTermCourse, termOn, type ClassAttendance as Attendance } from '../../lib/schoolTerms'
import { lmsCourses } from '../../lib/courseLinks'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { useAddonOn } from '../../hooks/useAddon'
import { useSchool } from '../../hooks/useSchool'
import type { Task } from '../../types/task'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { buttonClass } from '../ui/buttonClass'

/**
 * 授業の予定のカードの欠席の数（#452・#503・#622）。休むかを決める前に見えるよう、これからの回にも出す。
 * 始まった回（今日まで）は「欠席にする」「欠席を取り消す」を押せる。
 * 出すのは追加機能の学校がオンで、その日の学期があるときの、時間割の授業か、学期の授業と同じ名前の予定（Google カレンダーの予定も）だけ
 */
export function ClassAttendance({ title, date, task }: { title: string; date: string; task?: Task }) {
  const { t } = useTranslation()
  const today = useAppTodayKey()
  const tasks = useTaskStore((s) => s.tasks)
  const periods = useTaskStore((s) => s.timetable.periods)
  const links = useTaskStore((s) => s.courseLinks)
  const setCourseAbsent = useTaskStore((s) => s.setCourseAbsent)
  const schoolOn = useAddonOn('school')
  const school = useSchool()
  const term = schoolOn ? termOn(school, date) : null
  const a = useMemo<Attendance | null>(() => {
    if (!term) return null
    const isClass = !!task && isClassTask(task, periods, school, term)
    if (!isClass && !isTermCourse(tasks, periods, school, term, title, links, lmsCourses(tasks))) return null
    return courseAttendance(tasks, periods, school, term, title)
  }, [term, task, tasks, periods, school, title, links])
  if (!a) return null
  const absent = isAbsent(school, title, date)
  // その日の学期があるときだけ出すので、押せるのは始まった回
  const canMark = date <= today

  return (
    <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-4 py-2.5 dark:border-zinc-700">
      <p className={`text-sm tabular-nums ${DUE_TONE_CLASS[attendanceTone(a)]}`}>{attendanceText(a, t)}</p>
      {canMark && (
        <button
          type="button"
          aria-pressed={absent}
          onClick={() => setCourseAbsent(title, date, !absent)}
          className={buttonClass({ variant: 'ghost', size: 'sm' }, 'shrink-0')}
        >
          {absent ? t('timetable.unmarkAbsent') : t('timetable.markAbsent')}
        </button>
      )}
    </div>
  )
}
