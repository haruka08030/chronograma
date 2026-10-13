import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { COURSE_ASSIGNMENT_LIMIT, courseAssignments, eventCourse, lmsCourses } from '../../lib/courseLinks'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { META_TEXT } from '../ui/textClass'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { dueDateLabel } from '../ui/dueDateLabel'

/** 「つながない」を選ぶ値（科目のタグは前後の空白を落としてあるので、空白で始まる値と重ならない） */
const NONE = ' none'

/**
 * 授業の予定のカードに出す、その科目（Canvas・Moodle から取り込んだ課題のタグ）の未完了の課題（締切順に 3 件まで、#309）。
 * 押すとその課題の詳細を開く。科目の決め方は `lib/courseLinks.ts`（選んだつながり → 名前・ラベル名が科目と同じ）。
 * - つながる科目があり課題があれば、見出しの横で科目を選び直せる（「つながない」も）
 * - つながる科目が無ければ、科目を選ぶ欄だけ（LMS の課題を取り込んでいる人だけ。一度選べば同じ名前の予定はみなつながる）
 * - 課題が無い・「つながない」を選んだ予定は何も出さない
 */
export function CourseAssignments({
  title,
  labelName,
  onOpenTask,
}: {
  /** 予定の名前 */
  title: string
  /** 予定のラベル名（時間割で科目名のラベルを選んだ予定） */
  labelName?: string | null
  onOpenTask: (taskId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const links = useTaskStore((s) => s.courseLinks)
  const setCourseLink = useTaskStore((s) => s.setCourseLink)
  const courses = useMemo(() => lmsCourses(tasks), [tasks])
  const match = eventCourse({ title, labelName }, links, courses)
  const items = useMemo(() => (match.course ? courseAssignments(tasks, match.course) : []), [tasks, match.course])

  if (!title.trim() || courses.length === 0) return null
  if (match.chosen && !match.course) return null
  if (match.course && items.length === 0) return null

  const select = (
    <select
      value={match.course ?? ''}
      onChange={(e) => setCourseLink(title, e.target.value === NONE ? '' : e.target.value)}
      aria-label={t('courseTasks.selectAria', { title })}
      className={fieldClass({ size: 'sm' }, match.course ? 'max-w-[11rem] truncate' : 'w-full')}
    >
      {!match.course && (
        <option value="" disabled>
          {t('courseTasks.pick')}
        </option>
      )}
      {courses.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      {match.course && !courses.includes(match.course) && <option value={match.course}>{match.course}</option>}
      {match.course && <option value={NONE}>{t('courseTasks.none')}</option>}
    </select>
  )

  if (!match.course) return <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">{select}</div>

  const shown = items.slice(0, COURSE_ASSIGNMENT_LIMIT)
  const rest = items.length - shown.length
  return (
    <section aria-label={t('courseTasks.heading')} className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className={sectionLabelClass('section')}>{t('courseTasks.heading')}</h3>
        {select}
      </div>
      <ul className="-mx-2">
        {shown.map((task) => {
          const due = task.dueDate ? dueDateLabel(task.dueDate, task.dueTime, t, i18n.resolvedLanguage) : null
          return (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onOpenTask(task.id)}
                className="flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100">{task.title}</span>
                {due && <span className={`shrink-0 text-xs ${DUE_TONE_CLASS[due.tone]}`}>{due.text}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {rest > 0 && <p className={`mt-1 ${META_TEXT}`}>{t('courseTasks.more', { count: rest })}</p>}
    </section>
  )
}
