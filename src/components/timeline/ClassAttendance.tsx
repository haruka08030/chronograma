import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { attendanceText, attendanceTone, classAttendance, inTerm, isAbsent, isClassTask } from '../../lib/timetable'
import { courseAttendance, hasAbsenceCourse, type Attendance } from '../../lib/absenceCourses'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { useAddonOn } from '../../hooks/useAddon'
import type { Task } from '../../types/task'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { buttonClass } from '../ui/buttonClass'

/**
 * 授業の予定のカードの欠席の数（#452・#503）。休むかを決める前に見えるよう、これからの回にも出す。
 * 始まった回（今日まで）は「欠席にする」「欠席を取り消す」を押せる。
 * 出すのは、時間割の授業（追加機能の時間割がオン）か、授業の欠席の一覧にある名前の予定（追加機能の学校がオン。Google カレンダーの予定も）だけ
 */
export function ClassAttendance({ title, date, task }: { title: string; date: string; task?: Task }) {
  const { t } = useTranslation()
  const today = useAppTodayKey()
  const tasks = useTaskStore((s) => s.tasks)
  const timetable = useTaskStore((s) => s.timetable)
  const courses = useTaskStore((s) => s.addons.absenceCourses)
  const setCourseAbsent = useTaskStore((s) => s.setCourseAbsent)
  const timetableOn = useAddonOn('timetable')
  const schoolOn = useAddonOn('school')
  const isClass = timetableOn && !!task && isClassTask(task, timetable)
  const listed = schoolOn && hasAbsenceCourse(courses, title)
  const a = useMemo<Attendance | null>(() => {
    if (isClass) {
      const c = classAttendance(tasks, timetable, title)
      return c.total > 0 ? c : null
    }
    return listed ? courseAttendance(timetable, title) : null
  }, [isClass, listed, tasks, timetable, title])
  if (!a) return null
  const absent = isAbsent(timetable, title, date)
  // 学期の外の日は欠席にしても数えない（`normalizeTimetable` が落とす）ので押せなくする
  const canMark = date <= today && inTerm(date, timetable)

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
