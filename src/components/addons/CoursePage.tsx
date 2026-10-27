import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { ABSENCE_LIMIT_MAX, attendanceText, attendanceTone, timetableClasses } from '../../lib/timetable'
import { inTermRange, isAbsent, type Term } from '../../lib/schoolTerms'
import { ABSENCE_COURSE_TITLE_MAX } from '../../lib/absenceCourses'
import { courseKey, lmsCourses } from '../../lib/courseLinks'
import { openTaskDetail } from '../../lib/overlays'
import { isSubmitEnter } from '../../lib/keyboard'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { useDateFormat } from '../../hooks/useDateFormat'
import { SettingsSubPage } from '../settings/SettingsSubPage'
import { DateField } from '../DateField'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { FilterChips } from '../ui/FilterChips'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { CARD_TITLE_CLASS } from '../ui/headingClass'
import { DUE_TONE_CLASS, NOTICE_TONE_CLASS } from '../ui/dueTone'
import { dueDateLabel } from '../ui/dueDateLabel'
import { ERROR_TEXT, HINT_TEXT, META_TEXT } from '../ui/textClass'
import { useTermCourses } from '../../hooks/useTermCourses'

/** 「つながない」を選ぶ値（科目のタグは前後の空白を落としてあるので、空白で始まる値と重ならない） */
const NONE = ' none'

/**
 * 授業のページ（#622）。学期の 1 つの授業の時間割のコマ・欠席（休める回数・休んだ日）・課題（つながる Canvas・Moodle の科目の未完了の課題）。
 * 追加した授業は名前を直せる。追加した授業・Canvas・Moodle の科目は一覧から外せる（時間割の授業は時間割のマスから消す）
 */
export function CoursePage({
  term,
  title,
  onRenamed,
  onBack,
  backLabel,
}: {
  term: Term
  title: string
  onRenamed: (title: string) => void
  onBack: () => void
  backLabel: string
}) {
  const { t, i18n } = useTranslation()
  const df = useDateFormat()
  const today = useAppTodayKey()
  const tasks = useTaskStore((s) => s.tasks)
  const timetable = useTaskStore((s) => s.timetable)
  const setCourseAbsent = useTaskStore((s) => s.setCourseAbsent)
  const setCourseAbsenceLimit = useTaskStore((s) => s.setCourseAbsenceLimit)
  const renameAddedCourse = useTaskStore((s) => s.renameAddedCourse)
  const removeCourse = useTaskStore((s) => s.removeCourse)
  const setCourseLink = useTaskStore((s) => s.setCourseLink)
  const rows = useTermCourses(term)
  const row = rows.find((r) => courseKey(r.title) === courseKey(title))
  const lms = useMemo(() => lmsCourses(tasks), [tasks])
  const slots = useMemo(
    () =>
      [...timetableClasses(tasks, timetable.periods, term, term.termStart).values()]
        .filter((c) => courseKey(c.title) === courseKey(title))
        .sort((a, b) => a.weekday - b.weekday || a.period - b.period),
    [tasks, timetable.periods, term, title],
  )
  const savedLimit = term.absenceLimits[courseKey(title)]
  const [limit, setLimit] = useState(savedLimit === undefined ? '' : String(savedLimit))
  const [name, setName] = useState(title)
  // ⌘Z・ほかの端末で変わったら欄も合わせる（届いたときに 1 回だけ）
  const [seen, setSeen] = useState({ savedLimit, title })
  if (seen.savedLimit !== savedLimit || seen.title !== title) {
    setSeen({ savedLimit, title })
    setLimit(savedLimit === undefined ? '' : String(savedLimit))
    setName(title)
  }

  // 外した・学期を消したなどで授業が無くなったら一覧へ戻る
  useEffect(() => {
    if (!row) onBack()
  }, [row, onBack])
  if (!row) return null

  const weekdayLabels = t('habits.weekdays', { returnObjects: true }) as string[]
  const sep = t('common.timeRangeSeparator')
  const a = row.attendance
  const dates = [...(term.absences[courseKey(title)] ?? [])].reverse()
  const absentToday = isAbsent({ terms: [term] }, title, today)
  const canRename = row.added && !row.fromTimetable
  const nameTaken = !!name.trim() && courseKey(name) !== courseKey(title) && rows.some((r) => courseKey(r.title) === courseKey(name))

  const commitLimit = () => {
    const n = limit.trim() === '' ? null : Number(limit)
    if (n !== null && !Number.isFinite(n)) return
    if ((n === null ? undefined : n) === savedLimit) return
    setCourseAbsenceLimit(term.id, title, n)
  }
  const commitName = () => {
    const next = name.trim()
    if (!next || nameTaken || next === title) return setName(title)
    renameAddedCourse(title, next)
    onRenamed(next)
  }

  return (
    <SettingsSubPage title={title} backLabel={backLabel} onBack={onBack}>
      {canRename && (
        <label className="block">
          <span className={sectionLabelClass('field', 'mb-1 block')}>{t('absences.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (isSubmitEnter(e)) e.currentTarget.blur()
            }}
            maxLength={ABSENCE_COURSE_TITLE_MAX}
            aria-invalid={nameTaken}
            className={fieldClass({}, 'w-full max-w-sm')}
          />
          {nameTaken && <span className={`mt-1 block ${ERROR_TEXT}`}>{t('absences.nameTaken')}</span>}
        </label>
      )}

      <section aria-labelledby="course-slots">
        <h2 id="course-slots" className={CARD_TITLE_CLASS}>
          {t('timetable.title')}
        </h2>
        {slots.length === 0 ? (
          <p className={`mt-1 ${HINT_TEXT}`}>{t('school.noSlots')}</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
            {slots.map((c) => (
              <li key={`${c.weekday}:${c.period}`}>
                {t('timetable.cellPlace', { weekday: weekdayLabels[c.weekday - 1], n: c.period + 1 })}
                <span className={`ml-2 ${META_TEXT}`}>{`${c.startTime}${sep}${c.endTime}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="course-absences">
        <h2 id="course-absences" className={CARD_TITLE_CLASS}>
          {t('school.absences')}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className={`text-sm tabular-nums ${NOTICE_TONE_CLASS[attendanceTone(a)]}`}>{attendanceText(a, t)}</p>
          {inTermRange(today, term) && (
            <button
              type="button"
              aria-pressed={absentToday}
              onClick={() => setCourseAbsent(title, today, !absentToday)}
              className={buttonClass({ variant: absentToday ? 'secondary' : 'ghost', size: 'sm' })}
            >
              {absentToday ? t('absences.absentTodayDone') : t('absences.absentToday')}
            </button>
          )}
        </div>
        <label className="mt-3 flex items-center gap-2">
          <span className={sectionLabelClass('field')}>{t('absences.limit')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={ABSENCE_LIMIT_MAX}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={commitLimit}
            onKeyDown={(e) => {
              if (isSubmitEnter(e)) e.currentTarget.blur()
            }}
            placeholder={a.total > 0 ? String(Math.floor(a.total / 3)) : ''}
            aria-label={t('absences.limitAria')}
            className={fieldClass({ size: 'sm' }, 'w-16 tabular-nums')}
          />
          {limit.trim() === '' && (
            <span className={META_TEXT}>
              {a.total > 0 ? t('timetable.absenceLimitDefault', { total: a.total }) : t('absences.limitUnset')}
            </span>
          )}
        </label>
        <div className="mt-3">
          <span className={sectionLabelClass('field', 'mb-1 block')}>{t('absences.dates')}</span>
          {dates.length === 0 ? (
            <p className={HINT_TEXT}>{t('absences.noDates')}</p>
          ) : (
            <FilterChips
              chips={dates.map((d) => ({
                key: d,
                label: df.monthDay(d),
                removeLabel: t('absences.removeDateAria', { date: df.monthDay(d) }),
                onRemove: () => setCourseAbsent(title, d, false),
              }))}
              className="tabular-nums"
            />
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className={META_TEXT}>{t('absences.addDate')}</span>
            <DateField
              value={null}
              onChange={(d) => {
                if (inTermRange(d, term)) setCourseAbsent(title, d, true)
              }}
              min={term.termStart}
              ariaLabel={t('absences.addDate')}
              className={fieldClass({ size: 'sm' })}
            />
          </div>
          <p className={`mt-1 ${HINT_TEXT}`}>
            {t('absences.termHint', { term: `${df.monthDay(term.termStart)}${sep}${df.monthDay(term.termEnd)}` })}
          </p>
        </div>
      </section>

      <section aria-labelledby="course-assignments">
        <h2 id="course-assignments" className={CARD_TITLE_CLASS}>
          {t('school.assignments')}
        </h2>
        {lms.length === 0 ? (
          <p className={`mt-1 ${HINT_TEXT}`}>{t('school.noLms')}</p>
        ) : (
          <>
            <label className="mt-1 flex items-center gap-2">
              <span className={sectionLabelClass('field')}>{t('school.lmsCourse')}</span>
              <select
                value={row.lms ?? NONE}
                onChange={(e) => setCourseLink(title, e.target.value === NONE ? '' : e.target.value)}
                className={fieldClass({ size: 'sm' }, 'max-w-[14rem] truncate')}
              >
                {lms.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {row.lms && !lms.includes(row.lms) && <option value={row.lms}>{row.lms}</option>}
                <option value={NONE}>{t('courseTasks.none')}</option>
              </select>
            </label>
            {row.lms &&
              (row.assignments.length === 0 ? (
                <p className={`mt-2 ${HINT_TEXT}`}>{t('school.noAssignments')}</p>
              ) : (
                <ul className="-mx-2 mt-2">
                  {row.assignments.map((task) => {
                    const due = task.dueDate ? dueDateLabel(task.dueDate, task.dueTime, t, i18n.resolvedLanguage) : null
                    return (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => openTaskDetail(task.id)}
                          className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100">{task.title}</span>
                          {due && <span className={`shrink-0 text-xs ${DUE_TONE_CLASS[due.tone]}`}>{due.text}</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ))}
          </>
        )}
      </section>

      {!row.fromTimetable && (row.added || row.fromLms) ? (
        <div>
          <button
            type="button"
            onClick={() => removeCourse(term.id, title, row.fromLms)}
            className={buttonClass({ variant: 'danger', size: 'md' })}
          >
            {t('absences.remove')}
          </button>
        </div>
      ) : (
        <p className={HINT_TEXT}>{t('school.timetableOnlyHint')}</p>
      )}
    </SettingsSubPage>
  )
}
