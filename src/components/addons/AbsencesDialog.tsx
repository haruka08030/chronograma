import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { ABSENCE_LIMIT_MAX, attendanceText, attendanceTone, classAttendance, inTerm, isAbsent, isClassTask } from '../../lib/timetable'
import { ABSENCE_COURSE_TITLE_MAX, courseAttendance, hasAbsenceCourse, type Attendance } from '../../lib/absenceCourses'
import { courseKey } from '../../lib/courseLinks'
import { isSubmitEnter } from '../../lib/keyboard'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { useAddonOn } from '../../hooks/useAddon'
import { useDateFormat } from '../../hooks/useDateFormat'
import { Modal, ModalTitle } from '../ui/Modal'
import { DateField } from '../DateField'
import { CloseIcon, PlusIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { iconButtonClass } from '../ui/iconButtonClass'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { DUE_TONE_CLASS } from '../ui/dueTone'
import { ERROR_TEXT, HINT_TEXT, META_TEXT } from '../ui/textClass'

type Row = {
  title: string
  /** 時間割の授業（名前は時間割で直す。休める回数の既定は学期の回数の 1/3） */
  fromTimetable: boolean
  attendance: Attendance
  /** 時間割の授業の学期の回数（一覧の授業は null） */
  total: number | null
}

/**
 * 授業の欠席の一覧（#503、追加機能「学校」の「開く」）。授業ごとに「欠席 N / M 回」と、今日の欠席を 1 回で付ける「今日欠席」。
 * 押すと休める回数・休んだ日を直す。時間割の授業（時間割がオン）も同じ一覧に出る。あと何回休めるかが少ない順
 */
export function AbsencesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const today = useAppTodayKey()
  const tasks = useTaskStore((s) => s.tasks)
  const timetable = useTaskStore((s) => s.timetable)
  const courses = useTaskStore((s) => s.addons.absenceCourses)
  const setCourseAbsent = useTaskStore((s) => s.setCourseAbsent)
  const timetableOn = useAddonOn('timetable')
  const [editing, setEditing] = useState<Row | 'new' | null>(null)

  const rows = useMemo(() => {
    const out = new Map<string, Row>()
    if (timetableOn) {
      for (const task of tasks) {
        if (!isClassTask(task, timetable) || out.has(courseKey(task.title))) continue
        const attendance = classAttendance(tasks, timetable, task.title)
        out.set(courseKey(task.title), { title: task.title, fromTimetable: true, attendance, total: attendance.total })
      }
    }
    for (const title of courses) {
      if (!out.has(courseKey(title)))
        out.set(courseKey(title), { title, fromTimetable: false, attendance: courseAttendance(timetable, title), total: null })
    }
    // あと何回が少ない順（決めていない授業は後ろ）、同じなら名前順
    return [...out.values()].sort(
      (a, b) => (a.attendance.remaining ?? Infinity) - (b.attendance.remaining ?? Infinity) || a.title.localeCompare(b.title),
    )
  }, [timetableOn, tasks, timetable, courses])
  const todayInTerm = inTerm(today, timetable)
  const term = timetable.termStart && timetable.termEnd ? `${df.monthDay(timetable.termStart)}–${df.monthDay(timetable.termEnd)}` : null

  return (
    <Modal onClose={onClose} labelledBy="absences-title" width="md" className="flex max-h-[min(90vh,720px)] flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-4 pb-3 pt-5 dark:border-zinc-700 sm:px-6">
        <ModalTitle id="absences-title">{t('absences.title')}</ModalTitle>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4">
        {rows.length === 0 && <p className={`px-2 py-3 ${HINT_TEXT}`}>{t('absences.empty')}</p>}
        <ul aria-label={t('absences.title')}>
          {rows.map((row) => {
            const absentToday = isAbsent(timetable, row.title, today)
            return (
              <li key={courseKey(row.title)} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(row)}
                  className="flex min-w-0 flex-1 flex-col rounded-lg px-2 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                >
                  <span className="block truncate text-sm text-zinc-800 dark:text-zinc-100">{row.title}</span>
                  <span className={`block text-xs tabular-nums ${DUE_TONE_CLASS[attendanceTone(row.attendance)]}`}>
                    {attendanceText(row.attendance, t)}
                  </span>
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
        <button type="button" onClick={() => setEditing('new')} className={buttonClass({ variant: 'ghost', size: 'sm' }, 'mt-1')}>
          <PlusIcon className="h-3.5 w-3.5" />
          {t('absences.add')}
        </button>
        {term && <p className={`px-2 pt-3 ${HINT_TEXT}`}>{t('absences.termHint', { term })}</p>}
      </div>
      <div className="flex justify-end border-t border-zinc-200 px-4 py-3 dark:border-zinc-700 sm:px-6">
        <button type="button" onClick={onClose} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t('timetable.done')}
        </button>
      </div>
      {editing && <CourseEditor row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Modal>
  )
}

/** 授業を足す・直す。休める回数と、休んだ日（足す・取り消す。取り消しはすぐ効く）。時間割の授業は名前を変えない */
function CourseEditor({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const today = useAppTodayKey()
  const timetable = useTaskStore((s) => s.timetable)
  const courses = useTaskStore((s) => s.addons.absenceCourses)
  const saveAbsenceCourse = useTaskStore((s) => s.saveAbsenceCourse)
  const removeAbsenceCourse = useTaskStore((s) => s.removeAbsenceCourse)
  const setClassAbsenceLimit = useTaskStore((s) => s.setClassAbsenceLimit)
  const setCourseAbsent = useTaskStore((s) => s.setCourseAbsent)
  const [title, setTitle] = useState(row?.title ?? '')
  const savedLimit = row ? (timetable.absenceLimits[courseKey(row.title)] ?? null) : null
  const [limit, setLimit] = useState(savedLimit === null ? '' : String(savedLimit))
  const inputRef = useRef<HTMLInputElement>(null)
  const limitRef = useRef<HTMLInputElement>(null)
  const dates = row ? [...(timetable.absences[courseKey(row.title)] ?? [])].reverse() : []

  const name = title.trim()
  const taken = !!name && courseKey(name) !== courseKey(row?.title ?? '') && hasAbsenceCourse(courses, name)
  const n = limit.trim() === '' ? null : Math.min(ABSENCE_LIMIT_MAX, Math.max(0, Math.round(Number(limit))))
  const limitOk = n === null || Number.isFinite(n)
  const canSave = !!name && !taken && limitOk
  // 時間割の授業で決めていなければ、学期の回数の 1/3
  const total = row?.total ?? null

  const save = () => {
    if (!canSave) return
    if (row?.fromTimetable) {
      if (n !== savedLimit) setClassAbsenceLimit(row.title, n)
    } else saveAbsenceCourse(row?.title ?? null, name, n)
    onClose()
  }

  return (
    <Modal onClose={onClose} labelledBy="absence-course-title" width="sm" className="p-5" initialFocus={row ? limitRef : inputRef}>
      <ModalTitle id="absence-course-title">{row ? t('absences.edit') : t('absences.add')}</ModalTitle>
      {row?.fromTimetable ? (
        <div className="mt-4">
          <p className="text-sm text-zinc-800 dark:text-zinc-100">{row.title}</p>
          <p className={META_TEXT}>{t('absences.fromTimetable')}</p>
        </div>
      ) : (
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
            aria-invalid={taken}
            className={fieldClass({}, 'w-full')}
          />
          {taken && <span className={`mt-1 block ${ERROR_TEXT}`}>{t('absences.nameTaken')}</span>}
        </label>
      )}
      <label className="mt-3 flex items-center gap-2">
        <span className={sectionLabelClass('field')}>{t('absences.limit')}</span>
        <input
          ref={limitRef}
          type="number"
          inputMode="numeric"
          min={0}
          max={ABSENCE_LIMIT_MAX}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          onKeyDown={(e) => {
            if (isSubmitEnter(e)) save()
          }}
          placeholder={total !== null ? String(Math.floor(total / 3)) : ''}
          aria-label={t('absences.limitAria')}
          className={fieldClass({ size: 'sm' }, 'w-16 tabular-nums')}
        />
        {limit.trim() === '' && (
          <span className={META_TEXT}>{total !== null ? t('timetable.absenceLimitDefault', { total }) : t('absences.limitUnset')}</span>
        )}
      </label>
      {row && (
        <div className="mt-4">
          <span className={sectionLabelClass('field', 'mb-1 block')}>{t('absences.dates')}</span>
          {dates.length === 0 ? (
            <p className={HINT_TEXT}>{t('absences.noDates')}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {dates.map((d) => (
                <li
                  key={d}
                  className="flex items-center gap-0.5 rounded-full border border-zinc-200 py-0.5 pl-2.5 pr-1 text-xs tabular-nums text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
                >
                  {d.slice(0, 4) === today.slice(0, 4) ? df.monthDay(d) : df.fullDate(d)}
                  <button
                    type="button"
                    onClick={() => setCourseAbsent(row.title, d, false)}
                    aria-label={t('absences.removeDateAria', { date: df.monthDay(d) })}
                    className={iconButtonClass('p-0.5')}
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className={META_TEXT}>{t('absences.addDate')}</span>
            <DateField
              value={null}
              onChange={(d) => {
                if (d) setCourseAbsent(row.title, d, true)
              }}
              min={timetable.termStart ?? undefined}
              ariaLabel={t('absences.addDate')}
              className={fieldClass({ size: 'sm' })}
            />
          </div>
        </div>
      )}
      <div className="mt-5 flex items-center gap-2">
        {row && !row.fromTimetable && (
          <button
            type="button"
            onClick={() => {
              removeAbsenceCourse(row.title)
              onClose()
            }}
            className={buttonClass({ variant: 'danger', size: 'md' })}
          >
            {t('absences.remove')}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onClose} className={buttonClass({ variant: 'ghost', size: 'md' })}>
          {t('common.cancel')}
        </button>
        <button type="button" onClick={save} disabled={!canSave} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
