import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { attendanceText, attendanceTone } from '../../lib/timetable'
import { defaultTerm, inTermRange, isAbsent, type Term, type TermCourse } from '../../lib/schoolTerms'
import { ABSENCE_COURSE_TITLE_MAX } from '../../lib/absenceCourses'
import { courseKey, lmsCourses } from '../../lib/courseLinks'
import { isSubmitEnter } from '../../lib/keyboard'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { useSchool } from '../../hooks/useSchool'
import { TimetableBody } from '../calendar/TimetableDialog'
import { SettingsSubPage } from '../settings/SettingsSubPage'
import { Modal, ModalTitle } from '../ui/Modal'
import { ChevronRightIcon, PlusIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { chipClass } from '../ui/chipClass'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { CARD_TITLE_CLASS } from '../ui/headingClass'
import { NOTICE_TONE_CLASS } from '../ui/dueTone'
import { ERROR_TEXT, HINT_TEXT, META_TEXT } from '../ui/textClass'
import { SchoolTermBar } from './SchoolTermBar'
import { useTermCourses } from '../../hooks/useTermCourses'
import { CoursePage } from './CoursePage'

/**
 * 追加機能「学校」のページ（#617・#622）。上で学期を選び、その学期の時間割と授業の一覧。
 * 授業を押すと授業のページ（時間割のコマ・欠席・課題）へ進む
 */
export function SchoolPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const today = useAppTodayKey()
  const school = useSchool()
  const [termId, setTermId] = useState<string | null>(null)
  const [course, setCourse] = useState<string | null>(null)
  const term = school.terms.find((x) => x.id === termId) ?? defaultTerm(school, today)

  if (term && course) {
    return (
      <CoursePage term={term} title={course} onRenamed={setCourse} onBack={() => setCourse(null)} backLabel={t('addons.school.name')} />
    )
  }
  return (
    <SettingsSubPage title={t('addons.school.name')} backLabel={t('addons.title')} onBack={onBack}>
      <SchoolTermBar term={term} onSelect={setTermId} />
      {term && (
        <>
          <section aria-labelledby="school-timetable">
            <h2 id="school-timetable" className={CARD_TITLE_CLASS}>
              {t('timetable.title')}
            </h2>
            <p className={`mt-0.5 ${HINT_TEXT}`}>{t('timetable.intro')}</p>
            <div className="mt-2">
              <TimetableBody term={term} />
            </div>
          </section>
          <CourseList term={term} onOpen={setCourse} />
        </>
      )}
    </SettingsSubPage>
  )
}

/** 学期の授業の一覧。欠席の数・未完了の課題の数、学期の中なら「今日欠席」。押すと授業のページ */
function CourseList({ term, onOpen }: { term: Term; onOpen: (title: string) => void }) {
  const { t } = useTranslation()
  const today = useAppTodayKey()
  const school = useSchool()
  const setCourseAbsent = useTaskStore((s) => s.setCourseAbsent)
  const rows = useTermCourses(term)
  const [adding, setAdding] = useState(false)
  const todayInTerm = inTermRange(today, term)

  return (
    <section aria-labelledby="school-courses">
      <h2 id="school-courses" className={CARD_TITLE_CLASS}>
        {t('school.courses')}
      </h2>
      {rows.length === 0 && <p className={`mt-1 ${HINT_TEXT}`}>{t('school.coursesEmpty')}</p>}
      <ul aria-labelledby="school-courses" className="-mx-2 mt-1">
        {rows.map((row) => {
          const absentToday = isAbsent(school, row.title, today)
          return (
            <li key={courseKey(row.title)} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpen(row.title)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-800 dark:text-zinc-100">{row.title}</span>
                  <span className="block text-xs tabular-nums">
                    <span className={NOTICE_TONE_CLASS[attendanceTone(row.attendance)]}>{attendanceText(row.attendance, t)}</span>
                    {row.assignments.length > 0 && (
                      <span className={META_TEXT}> · {t('school.assignmentsCount', { count: row.assignments.length })}</span>
                    )}
                  </span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-400" />
              </button>
              {todayInTerm && (
                <button
                  type="button"
                  aria-pressed={absentToday}
                  aria-label={t('absences.absentTodayAria', { name: row.title })}
                  onClick={() => setCourseAbsent(row.title, today, !absentToday)}
                  className={buttonClass({ variant: absentToday ? 'secondary' : 'ghost', size: 'sm' }, 'shrink-0')}
                >
                  {absentToday ? t('absences.absentTodayDone') : t('absences.absentToday')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <button type="button" onClick={() => setAdding(true)} className={buttonClass({ variant: 'ghost', size: 'sm' }, 'mt-1')}>
        <PlusIcon className="h-3.5 w-3.5" />
        {t('absences.add')}
      </button>
      {adding && <AddCourseDialog term={term} existing={rows} onClose={() => setAdding(false)} />}
    </section>
  )
}

/**
 * 学期に授業を足す。名前を打つか、候補（学期の間の Google カレンダーの毎週の予定・一覧に無い Canvas・Moodle の科目）を押す。
 * Google の予定は自動では入れない（バイト・ジムと区別がつかない）
 */
function AddCourseDialog({ term, existing, onClose }: { term: Term; existing: TermCourse[]; onClose: () => void }) {
  const { t } = useTranslation()
  const tasks = useTaskStore((s) => s.tasks)
  const calendarEvents = useTaskStore((s) => s.calendarEvents)
  const addCourse = useTaskStore((s) => s.addCourse)
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const taken = new Set(existing.map((c) => courseKey(c.title)))
  const name = title.trim()
  const dup = !!name && taken.has(courseKey(name))

  const suggestions = useMemo(() => {
    const out = new Map<string, string>()
    for (const ev of calendarEvents) {
      if (!ev.recurringEventId || ev.isAllDay || !ev.summary.trim() || !inTermRange(ev.date, term)) continue
      const key = courseKey(ev.summary)
      if (!taken.has(key) && !out.has(key)) out.set(key, ev.summary.trim())
    }
    for (const c of lmsCourses(tasks)) if (!taken.has(courseKey(c)) && !out.has(courseKey(c))) out.set(courseKey(c), c)
    return [...out.values()].slice(0, 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- taken は existing から作る
  }, [calendarEvents, tasks, term, existing])

  const save = (value = name) => {
    if (!value || taken.has(courseKey(value))) return
    addCourse(term.id, value)
    onClose()
  }

  return (
    <Modal onClose={onClose} labelledBy="school-add-course" width="sm" className="p-5" initialFocus={inputRef}>
      <ModalTitle id="school-add-course">{t('absences.add')}</ModalTitle>
      <label className="mt-4 block">
        <span className={sectionLabelClass('field', 'mb-1 block')}>{t('absences.name')}</span>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (isSubmitEnter(e)) save()
          }}
          maxLength={ABSENCE_COURSE_TITLE_MAX}
          placeholder={t('absences.namePlaceholder')}
          aria-invalid={dup}
          className={fieldClass({}, 'w-full')}
        />
        {dup && <span className={`mt-1 block ${ERROR_TEXT}`}>{t('absences.nameTaken')}</span>}
      </label>
      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className={META_TEXT}>{t('school.suggestions')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => save(s)} className={chipClass({ variant: 'outline', size: 'md' })}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClass({ variant: 'ghost', size: 'md' })}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={() => save()} disabled={!name || dup} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
