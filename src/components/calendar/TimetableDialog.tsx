import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import {
  ABSENCE_LIMIT_MAX,
  TIMETABLE_PERIOD_MAX,
  TIMETABLE_WEEKDAYS,
  attendanceText,
  attendanceTone,
  cellKey,
  classStartDate,
  isValidPeriod,
  timetableClasses,
  type Timetable,
  type TimetableClass,
  type TimetablePeriod,
} from '../../lib/timetable'
import { seriesDates } from '../../lib/eventSeries'
import { courseAttendance, defaultTerm, termCourses, type ClassAttendance, type Term } from '../../lib/schoolTerms'
import { useSchool } from '../../hooks/useSchool'
import { SchoolTermBar } from '../addons/SchoolTermBar'
import { courseKey, lmsCourses } from '../../lib/courseLinks'
import { NOTICE_TONE_CLASS } from '../ui/dueTone'
import { colorVars } from '../../lib/logCategoryColors'
import { planHex } from '../../lib/planVisual'
import { NEUTRAL_HEX } from '../../lib/googleColors'
import { addClockMinutes, endAfterStartEdit } from '../../lib/clockTime'
import { isSubmitEnter } from '../../lib/keyboard'
import { tip } from '../../lib/tooltip'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { useDateFormat } from '../../hooks/useDateFormat'
import { usePlanColorText } from '../../hooks/usePlanColorText'
import { Modal, ModalTitle } from '../ui/Modal'
import { DisclosureButton } from '../ui/Disclosure'
import { TimeInput } from '../TimeInput'
import { ColorLabelSelect } from '../labels/ColorLabelSelect'
import { PlusIcon, TrashIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { iconButtonClass } from '../ui/iconButtonClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { ERROR_TEXT, HINT_TEXT, META_TEXT } from '../ui/textClass'
import { useDialogDraft } from '../../hooks/useDialogDraft'
import { Switch } from '../settings/SettingsPrimitives'

/**
 * 時間割（#279）。週表示の見出しの「時間割」で開くダイアログ。上で学期を選び（最初は今日の学期）、中身は追加機能「学校」のページと同じ
 */
export function TimetableDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const today = useAppTodayKey()
  const school = useSchool()
  const [termId, setTermId] = useState<string | null>(null)
  const term = school.terms.find((x) => x.id === termId) ?? defaultTerm(school, today)
  return (
    <Modal onClose={onClose} labelledBy="timetable-title" width="lg" className="flex max-h-[min(90vh,820px)] flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-4 pb-3 pt-5 dark:border-zinc-700 sm:px-6">
        <ModalTitle id="timetable-title">{t('timetable.title')}</ModalTitle>
        <p className={`mt-1 ${HINT_TEXT}`}>{t('timetable.intro')}</p>
        <div className="mt-2">
          <SchoolTermBar term={term} onSelect={setTermId} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">{term && <TimetableBody term={term} />}</div>
      <div className="flex justify-end border-t border-zinc-200 px-4 py-3 dark:border-zinc-700 sm:px-6">
        <button type="button" onClick={onClose} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t('timetable.done')}
        </button>
      </div>
    </Modal>
  )
}

/**
 * 学期の時間割の中身。曜日（月〜土）× 時限のマスを押して授業を入れると、学期の間の毎週の予定ができる。
 * 上の「時限と祝日」で時限（学校ごとに違う。学期をまたいで同じ）・祝日を除くかを決める（決めたらすぐ保存し、端末間で同期）。
 * マスはボタンで「月曜 2 限 空き」「月曜 2 限 経済学入門」と読む
 */
export function TimetableBody({ term }: { term: Term }) {
  const { t } = useTranslation()
  const today = useAppTodayKey()
  const timetable = useTaskStore((s) => s.timetable)
  const tasks = useTaskStore((s) => s.tasks)
  const school = useSchool()
  const classes = useMemo(() => timetableClasses(tasks, timetable.periods, term, today), [tasks, timetable.periods, term, today])
  // 欠席の数（授業名ごと、#452）
  const attendance = useMemo(() => {
    const out = new Map<string, ClassAttendance>()
    for (const c of classes.values()) {
      const key = courseKey(c.title)
      if (!out.has(key)) out.set(key, courseAttendance(tasks, timetable.periods, school, term, c.title))
    }
    return out
  }, [classes, tasks, timetable.periods, school, term])
  // 最初はたたんでマスを先に見せる（スマホでは設定の欄が画面の大半を取る）
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<{ weekday: number; period: number } | null>(null)
  const weekdayLabels = t('habits.weekdays', { returnObjects: true }) as string[]
  const sep = t('common.timeRangeSeparator')

  return (
    <>
      <DisclosureButton open={settingsOpen} onToggle={() => setSettingsOpen((o) => !o)} className="-ml-3">
        {t('timetable.settingsSummary')}
      </DisclosureButton>
      {settingsOpen && <TimetableSettings timetable={timetable} />}

      <div
        className="mt-3 grid gap-1"
        style={{ gridTemplateColumns: `minmax(2.75rem, auto) repeat(${TIMETABLE_WEEKDAYS.length}, minmax(0, 1fr))` }}
      >
        <span />
        {TIMETABLE_WEEKDAYS.map((d) => (
          <span key={d} className="pb-1 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {weekdayLabels[d - 1]}
          </span>
        ))}
        {timetable.periods.map((p, i) => (
          <PeriodRow
            key={`${i}-${p.start}`}
            index={i}
            period={p}
            sep={sep}
            classes={classes}
            attendance={attendance}
            weekdayLabels={weekdayLabels}
            onCell={(weekday) => setEditing({ weekday, period: i })}
          />
        ))}
      </div>
      {timetable.periods.length === 0 && <p className={`mt-2 ${HINT_TEXT}`}>{t('timetable.noPeriods')}</p>}
      {editing && timetable.periods[editing.period] && (
        <ClassEditor
          weekday={editing.weekday}
          periodIndex={editing.period}
          period={timetable.periods[editing.period]!}
          term={term}
          current={classes.get(cellKey(editing.weekday, editing.period)) ?? null}
          attendance={attendance}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function PeriodRow({
  index,
  period,
  sep,
  classes,
  attendance,
  weekdayLabels,
  onCell,
}: {
  index: number
  period: TimetablePeriod
  sep: string
  classes: Map<string, TimetableClass>
  attendance: Map<string, ClassAttendance>
  weekdayLabels: string[]
  onCell: (weekday: number) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex flex-col justify-center pr-1 text-right">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{t('timetable.periodName', { n: index + 1 })}</span>
        <span className="text-[10px] leading-tight tabular-nums text-zinc-400">
          {period.start}
          <br />
          {period.end}
        </span>
      </div>
      {TIMETABLE_WEEKDAYS.map((d) => {
        const c = classes.get(cellKey(d, index))
        const place = t('timetable.cellPlace', { weekday: weekdayLabels[d - 1], n: index + 1 })
        // 欠席のある授業だけ数を出す（休んでいない授業のマスは名前だけ）
        const a = c ? attendance.get(courseKey(c.title)) : undefined
        const absences = a && a.absent > 0 ? a : null
        return (
          <button
            key={d}
            type="button"
            data-timetable-cell={cellKey(d, index)}
            onClick={() => onCell(d)}
            aria-label={c ? `${place} ${c.title}${absences ? ` ${attendanceText(absences, t)}` : ''}` : `${place} ${t('timetable.empty')}`}
            {...tip(c ? `${c.title}  ${c.startTime}${sep}${c.endTime}` : undefined)}
            className={`min-h-[3.25rem] rounded-md p-1 text-left text-[11px] leading-tight transition-colors sm:min-h-[3.75rem] sm:text-xs ${
              c
                ? 'gc-plan hover:brightness-95'
                : 'group border border-dashed border-zinc-200 text-zinc-300 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-600 dark:hover:bg-zinc-800/60'
            }`}
            style={c ? colorVars(planHex(c)) : undefined}
          >
            {c ? (
              <>
                <span className="line-clamp-3 break-words font-medium">{c.title}</span>
                {absences && (
                  <span
                    aria-hidden
                    className={`mt-0.5 block tabular-nums ${attendanceTone(absences) === 'future' ? 'opacity-70' : NOTICE_TONE_CLASS[attendanceTone(absences)]}`}
                  >
                    {t('timetable.cellAttendance', { absent: absences.absent, limit: absences.limit ?? '–' })}
                  </span>
                )}
              </>
            ) : (
              // ＋ は乗せなくても出す（押すと授業を入れられると分かるように。指の端末にはホバーが無い）
              <span
                aria-hidden
                className="flex h-full items-center justify-center group-hover:text-zinc-500 dark:group-hover:text-zinc-400"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </span>
            )}
          </button>
        )
      })}
    </>
  )
}

/** 時限・祝日を除くか（学期をまたいで同じ）。時限は使える形のときだけ保存する（打っている途中で消えない） */
function TimetableSettings({ timetable }: { timetable: Timetable }) {
  const { t } = useTranslation()
  const saveTimetable = useTaskStore((s) => s.saveTimetable)
  const defaultBlockMinutes = useTaskStore((s) => s.defaultBlockMinutes)
  const [periods, setPeriods] = useState<TimetablePeriod[]>(timetable.periods)
  const allValid = periods.every(isValidPeriod)
  const listRef = useRef<HTMLOListElement>(null)

  const commitPeriods = (next: TimetablePeriod[]) => {
    setPeriods(next)
    if (next.every(isValidPeriod)) saveTimetable({ ...timetable, periods: next })
  }
  const timeClass = fieldClass({ size: 'sm' }, 'w-[5.5rem] tabular-nums')

  return (
    <div className="mb-2 space-y-4 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
      <div>
        <p className={sectionLabelClass('field', 'mb-1.5 block')}>{t('timetable.periods')}</p>
        <ol ref={listRef} className="space-y-1.5">
          {periods.map((p, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{t('timetable.periodName', { n: i + 1 })}</span>
              <TimeInput
                value={p.start}
                onChange={(v) =>
                  commitPeriods(periods.map((x, j) => (j === i ? { ...x, start: v, end: endAfterStartEdit(x.start, x.end, v, 90) } : x)))
                }
                ariaLabel={t('timetable.periodStartAria', { n: i + 1 })}
                className={timeClass}
              />
              <span className="text-zinc-400">{t('common.timeRangeSeparator')}</span>
              <TimeInput
                value={p.end}
                onChange={(v) => commitPeriods(periods.map((x, j) => (j === i ? { ...x, end: v } : x)))}
                ariaLabel={t('timetable.periodEndAria', { n: i + 1 })}
                pickerDefault={p.start ? addClockMinutes(p.start, 90) : undefined}
                durationFrom={p.start || undefined}
                className={timeClass}
              />
              <button
                type="button"
                onClick={() => commitPeriods(periods.filter((_, j) => j !== i))}
                {...tip(t('timetable.removePeriod', { n: i + 1 }), { name: true })}
                className={iconButtonClass()}
              >
                <TrashIcon className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ol>
        {!allValid && (
          <p role="alert" className={`mt-1 ${ERROR_TEXT}`}>
            {t('timetable.periodInvalid')}
          </p>
        )}
        <button
          type="button"
          disabled={periods.length >= TIMETABLE_PERIOD_MAX}
          onClick={() => {
            const last = periods.at(-1)
            const start = last && isValidPeriod(last) ? addClockMinutes(last.end, 10) : '09:00'
            commitPeriods([...periods, { start, end: addClockMinutes(start, Math.max(defaultBlockMinutes, 90)) }])
          }}
          className={buttonClass({ variant: 'ghost', size: 'sm' }, 'mt-1.5')}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {t('timetable.addPeriod')}
        </button>
        <p className={`mt-1 ${HINT_TEXT}`}>{t('timetable.periodsHint')}</p>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-300">
        <span>{t('timetable.skipHolidays')}</span>
        <Switch
          checked={timetable.skipHolidays}
          onChange={(v) => saveTimetable({ ...timetable, skipHolidays: v })}
          label={t('timetable.skipHolidays')}
        />
      </div>
    </div>
  )
}

/**
 * マスを押したときの授業の入力（名前・ラベル）。空きのマスは学期の間の毎週の予定を作り、入っているマスは名前・ラベルを直す・消す
 * （直す・消すのは今日から後の回。過ぎた回はそのまま残す）。
 * 外側・Esc で閉じても書きかけは残す（`useDialogDraft`、マスと授業ごと）。保存・削除・キャンセルで捨てる
 */
function ClassEditor({
  weekday,
  periodIndex,
  period,
  term,
  current,
  attendance,
  onClose,
}: {
  weekday: number
  periodIndex: number
  period: TimetablePeriod
  term: Term
  current: TimetableClass | null
  attendance: Map<string, ClassAttendance>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const today = useAppTodayKey()
  const tasks = useTaskStore((s) => s.tasks)
  const timetable = useTaskStore((s) => s.timetable)
  const links = useTaskStore((s) => s.courseLinks)
  const school = useSchool()
  const addTimetableClass = useTaskStore((s) => s.addTimetableClass)
  const updateTimetableClass = useTaskStore((s) => s.updateTimetableClass)
  const deleteEventSeries = useTaskStore((s) => s.deleteEventSeries)
  const setCourseAbsenceLimit = useTaskStore((s) => s.setCourseAbsenceLimit)
  const att = current ? attendance.get(courseKey(current.title)) : undefined
  const [draft, setDraft, discardDraft] = useDialogDraft(
    `timetable-class:${cellKey(weekday, periodIndex)}:${current?.firstTaskId ?? 'new'}`,
    () => ({
      title: current?.title ?? '',
      color: current?.color ?? null,
      // 休める回数。空は決めない（学期の回数の 1/3）
      limit: att?.limitSet ? String(att.limit) : '',
    }),
  )
  const { title, color, limit } = draft
  const patch = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }))
  const colorText = usePlanColorText(color)
  // 候補は学期の授業（追加した授業・Canvas・Moodle の科目）と、ほかの科目
  const courses = useMemo(() => {
    const lms = lmsCourses(tasks)
    const names = termCourses(tasks, timetable.periods, school, term, links, lms).map((c) => c.title)
    return [...new Map([...names, ...lms].map((n) => [courseKey(n), n])).values()]
  }, [tasks, timetable.periods, school, term, links])
  const inputRef = useRef<HTMLInputElement>(null)
  const weekdayLabels = t('habits.weekdays', { returnObjects: true }) as string[]
  const place = t('timetable.cellPlace', { weekday: weekdayLabels[weekday - 1], n: periodIndex + 1 })
  const sep = t('common.timeRangeSeparator')

  const from = classStartDate(term, today)
  const until = term.termEnd
  const dates = current ? [] : seriesDates(from, { weekdays: [weekday], until, skipHolidays: timetable.skipHolidays })
  const count = current ? current.count : dates.length

  const save = () => {
    const name = title.trim()
    if (!name) return
    if (current) {
      // 休める回数は今の名前に決めてから名前を直す（直すと新しい名前に移る）
      const n = limit.trim() === '' ? null : Number(limit)
      if (att && (n === null ? att.limitSet : Number.isFinite(n) && (!att.limitSet || n !== att.limit))) {
        setCourseAbsenceLimit(term.id, current.title, n)
      }
      updateTimetableClass(current.firstTaskId, { title: name, color })
    } else {
      addTimetableClass({ weekday, startTime: period.start, endTime: period.end, title: name, color }, term)
    }
    discardDraft()
    onClose()
  }
  const cancel = () => {
    discardDraft()
    onClose()
  }

  // 確認なしで今日から後の回を消し、「元に戻す」を出す（ほかの削除と同じ）
  const remove = () => {
    if (!current) return
    deleteEventSeries(current.firstTaskId, 'following')
    discardDraft()
    onClose()
  }

  return (
    <Modal onClose={onClose} labelledBy="timetable-class-title" width="sm" className="p-5" initialFocus={inputRef}>
      <ModalTitle id="timetable-class-title">{place}</ModalTitle>
      <p className={`mt-1 tabular-nums ${META_TEXT}`}>
        {current
          ? t('timetable.classRest', { time: `${current.startTime}${sep}${current.endTime}`, count })
          : t('timetable.classRange', {
              from: df.monthDay(dates[0] ?? from),
              until: df.monthDay(until),
              time: `${period.start}${sep}${period.end}`,
              count,
            })}
      </p>
      <label className="mt-4 block">
        <span className={sectionLabelClass('field', 'mb-1 block')}>{t('timetable.className')}</span>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => patch({ title: e.target.value })}
          onKeyDown={(e) => {
            if (isSubmitEnter(e)) save()
          }}
          list={courses.length > 0 ? 'timetable-courses' : undefined}
          maxLength={100}
          placeholder={t('timetable.classNamePlaceholder')}
          className={fieldClass({}, 'w-full')}
        />
        {courses.length > 0 && (
          <datalist id="timetable-courses">
            {courses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        )}
      </label>
      {courses.length > 0 && <p className={`mt-1 ${HINT_TEXT}`}>{t('timetable.courseHint')}</p>}
      <div className="mt-3">
        <ColorLabelSelect
          current={color}
          currentText={colorText}
          onChoose={(c) => patch({ color: c })}
          defaultLabel={t('labels.none')}
          defaultHex={NEUTRAL_HEX}
          label={t('labels.pickerAria')}
        />
      </div>
      {current && att && att.total > 0 && att.limit !== null && (
        <label className="mt-3 flex items-center gap-2">
          <span className={sectionLabelClass('field')}>{t('timetable.absenceLimit')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={ABSENCE_LIMIT_MAX}
            value={limit}
            onChange={(e) => patch({ limit: e.target.value })}
            onKeyDown={(e) => {
              if (isSubmitEnter(e)) save()
            }}
            placeholder={String(Math.floor(att.total / 3))}
            aria-label={t('timetable.absenceLimitAria', { total: att.total })}
            className={fieldClass({ size: 'sm' }, 'w-16 tabular-nums')}
          />
          <span className={META_TEXT}>
            {limit.trim() === ''
              ? t('timetable.absenceLimitDefault', { total: att.total })
              : attendanceText({ ...att, limit: Number(limit) || 0, remaining: (Number(limit) || 0) - att.absent }, t)}
          </span>
        </label>
      )}
      {!current && count === 0 && (
        <p role="alert" className={`mt-3 ${ERROR_TEXT}`}>
          {t('timetable.noDays')}
        </p>
      )}
      <div className="mt-5 flex items-center gap-2">
        {current && (
          <button type="button" onClick={remove} className={buttonClass({ variant: 'danger', size: 'md' })}>
            {t('common.delete')}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={cancel} className={buttonClass({ variant: 'ghost', size: 'md' })}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!title.trim() || (!current && count === 0)}
          className={buttonClass({ variant: 'primary', size: 'md' })}
        >
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
