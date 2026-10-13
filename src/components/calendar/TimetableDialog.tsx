import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import {
  TIMETABLE_PERIOD_MAX,
  TIMETABLE_WEEKDAYS,
  cellKey,
  classStartDate,
  isValidPeriod,
  suggestTerm,
  timetableClasses,
  type Timetable,
  type TimetableClass,
  type TimetablePeriod,
} from '../../lib/timetable'
import { defaultSeriesUntil, seriesDates } from '../../lib/eventSeries'
import { lmsCourses } from '../../lib/courseLinks'
import { colorVars } from '../../lib/logCategoryColors'
import { planHex } from '../../lib/planVisual'
import { NEUTRAL_HEX } from '../../lib/googleColors'
import { addClockMinutes } from '../../lib/clockTime'
import { isSubmitEnter } from '../../lib/keyboard'
import { askConfirm } from '../../lib/confirmDialog'
import { tip } from '../../lib/tooltip'
import { useAppTodayKey } from '../../hooks/useAppClock'
import { useDateFormat } from '../../hooks/useDateFormat'
import { usePlanColorText } from '../../hooks/useTaskColor'
import { Modal, ModalTitle } from '../ui/Modal'
import { DisclosureButton } from '../ui/Disclosure'
import { TimeInput } from '../TimeInput'
import { DateField } from '../DateField'
import { ColorLabelSelect } from '../labels/ColorLabelPicker'
import { PlusIcon, TrashIcon } from '../icons'
import { buttonClass } from '../ui/buttonClass'
import { fieldClass } from '../ui/fieldClass'
import { iconButtonClass } from '../ui/iconButtonClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { ERROR_TEXT, HINT_TEXT, META_TEXT } from '../ui/textClass'

/** 学期を決めていなければ案（前期・後期）で埋めたもの。保存は授業を入れたとき・学期を直したとき */
function withTerm(tt: Timetable, today: string): Timetable {
  if (tt.termStart && tt.termEnd) return tt
  const s = suggestTerm(today)
  return { ...tt, termStart: tt.termStart ?? s.termStart, termEnd: tt.termEnd ?? s.termEnd }
}

/**
 * 時間割（#279）。曜日（月〜土）× 時限のマスを押して授業を入れると、学期の間の毎週の予定ができる。
 * 上の「時限と学期」で時限（学校ごとに違う）・学期の期間・祝日を除くかを決める（決めたらすぐ保存し、端末間で同期）。
 * マスはボタンで「月曜 2 限 空き」「月曜 2 限 経済学入門」と読む
 */
export function TimetableDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const today = useAppTodayKey()
  const saved = useTaskStore((s) => s.timetable)
  const tasks = useTaskStore((s) => s.tasks)
  const timetable = useMemo(() => withTerm(saved, today), [saved, today])
  const classes = useMemo(() => timetableClasses(tasks, timetable, today), [tasks, timetable, today])
  const df = useDateFormat()
  // 最初はたたんでマスを先に見せる（スマホでは設定の欄が画面の大半を取る）。見出しに学期を出し、決めていなければ「学期を決める」
  const [settingsOpen, setSettingsOpen] = useState(false)
  const termText = `${df.monthDay(timetable.termStart!)}${t('common.timeRangeSeparator')}${df.monthDay(timetable.termEnd!)}`
  const termSaved = !!saved.termStart && !!saved.termEnd
  const [editing, setEditing] = useState<{ weekday: number; period: number } | null>(null)
  const weekdayLabels = t('habits.weekdays', { returnObjects: true }) as string[]
  const sep = t('common.timeRangeSeparator')

  return (
    <Modal onClose={onClose} labelledBy="timetable-title" width="lg" className="flex max-h-[min(90vh,820px)] flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-4 pb-3 pt-5 dark:border-zinc-700 sm:px-6">
        <ModalTitle id="timetable-title">{t('timetable.title')}</ModalTitle>
        <p className={`mt-1 ${HINT_TEXT}`}>{t('timetable.intro')}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
        <DisclosureButton open={settingsOpen} onToggle={() => setSettingsOpen((o) => !o)} className="-ml-3">
          {termSaved ? t('timetable.settingsSummary', { term: termText }) : t('timetable.settingsUnset', { term: termText })}
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
              weekdayLabels={weekdayLabels}
              onCell={(weekday) => setEditing({ weekday, period: i })}
            />
          ))}
        </div>
        {timetable.periods.length === 0 && <p className={`mt-2 ${HINT_TEXT}`}>{t('timetable.noPeriods')}</p>}
      </div>
      <div className="flex justify-end border-t border-zinc-200 px-4 py-3 dark:border-zinc-700 sm:px-6">
        <button type="button" onClick={onClose} className={buttonClass({ variant: 'primary', size: 'md' })}>
          {t('timetable.done')}
        </button>
      </div>
      {editing && timetable.periods[editing.period] && (
        <ClassEditor
          weekday={editing.weekday}
          periodIndex={editing.period}
          period={timetable.periods[editing.period]!}
          timetable={timetable}
          current={classes.get(cellKey(editing.weekday, editing.period)) ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </Modal>
  )
}

function PeriodRow({
  index,
  period,
  sep,
  classes,
  weekdayLabels,
  onCell,
}: {
  index: number
  period: TimetablePeriod
  sep: string
  classes: Map<string, TimetableClass>
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
        return (
          <button
            key={d}
            type="button"
            data-timetable-cell={cellKey(d, index)}
            onClick={() => onCell(d)}
            aria-label={c ? `${place} ${c.title}` : `${place} ${t('timetable.empty')}`}
            title={c ? `${c.title}  ${c.startTime}${sep}${c.endTime}` : undefined}
            className={`min-h-[3.25rem] rounded-md p-1 text-left text-[11px] leading-tight transition-colors sm:min-h-[3.75rem] sm:text-xs ${
              c
                ? 'gc-plan hover:brightness-95'
                : 'group border border-dashed border-zinc-200 text-zinc-300 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-600 dark:hover:bg-zinc-800/60'
            }`}
            style={c ? colorVars(planHex(c)) : undefined}
          >
            {c ? (
              <span className="line-clamp-3 break-words font-medium">{c.title}</span>
            ) : (
              <span aria-hidden className="flex h-full items-center justify-center opacity-0 group-hover:opacity-100">
                <PlusIcon className="h-3.5 w-3.5" />
              </span>
            )}
          </button>
        )
      })}
    </>
  )
}

/** 時限・学期・祝日を除くか。時限は使える形のときだけ保存する（打っている途中で消えない） */
function TimetableSettings({ timetable }: { timetable: Timetable }) {
  const { t } = useTranslation()
  const saveTimetable = useTaskStore((s) => s.saveTimetable)
  const defaultBlockMinutes = useTaskStore((s) => s.defaultBlockMinutes)
  const [periods, setPeriods] = useState<TimetablePeriod[]>(timetable.periods)
  const allValid = periods.every(isValidPeriod)
  const termBad = !!timetable.termStart && !!timetable.termEnd && timetable.termStart > timetable.termEnd
  const listRef = useRef<HTMLOListElement>(null)

  const commitPeriods = (next: TimetablePeriod[]) => {
    setPeriods(next)
    if (next.every(isValidPeriod)) saveTimetable({ ...timetable, periods: next })
  }
  const timeClass = fieldClass({ size: 'sm' }, 'w-[5.5rem] tabular-nums')

  return (
    <div className="mb-2 space-y-4 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
      <div>
        <p className={sectionLabelClass('field', 'mb-1.5 block')}>{t('timetable.term')}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <DateField
            value={timetable.termStart}
            onChange={(v) => saveTimetable({ ...timetable, termStart: v })}
            ariaLabel={t('timetable.termStart')}
            className={fieldClass({ size: 'sm' })}
          />
          <span className="text-zinc-400">{t('common.timeRangeSeparator')}</span>
          <DateField
            value={timetable.termEnd}
            min={timetable.termStart ?? undefined}
            onChange={(v) => saveTimetable({ ...timetable, termEnd: v })}
            ariaLabel={t('timetable.termEnd')}
            className={fieldClass({ size: 'sm' })}
          />
        </div>
        {termBad && (
          <p role="alert" className={`mt-1 ${ERROR_TEXT}`}>
            {t('timetable.termInvalid')}
          </p>
        )}
      </div>
      <div>
        <p className={sectionLabelClass('field', 'mb-1.5 block')}>{t('timetable.periods')}</p>
        <ol ref={listRef} className="space-y-1.5">
          {periods.map((p, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{t('timetable.periodName', { n: i + 1 })}</span>
              <TimeInput
                value={p.start}
                onChange={(v) => commitPeriods(periods.map((x, j) => (j === i ? { ...x, start: v } : x)))}
                ariaLabel={t('timetable.periodStartAria', { n: i + 1 })}
                className={timeClass}
              />
              <span className="text-zinc-400">{t('common.timeRangeSeparator')}</span>
              <TimeInput
                value={p.end}
                onChange={(v) => commitPeriods(periods.map((x, j) => (j === i ? { ...x, end: v } : x)))}
                ariaLabel={t('timetable.periodEndAria', { n: i + 1 })}
                pickerDefault={p.start ? addClockMinutes(p.start, 90) : undefined}
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
      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={timetable.skipHolidays}
          onChange={(e) => saveTimetable({ ...timetable, skipHolidays: e.target.checked })}
          className="h-4 w-4 rounded border-zinc-300"
        />
        {t('timetable.skipHolidays')}
      </label>
    </div>
  )
}

/**
 * マスを押したときの授業の入力（名前・ラベル）。空きのマスは学期の間の毎週の予定を作り、入っているマスは名前・ラベルを直す・消す
 * （直す・消すのは今日から後の回。過ぎた回はそのまま残す）
 */
function ClassEditor({
  weekday,
  periodIndex,
  period,
  timetable,
  current,
  onClose,
}: {
  weekday: number
  periodIndex: number
  period: TimetablePeriod
  timetable: Timetable
  current: TimetableClass | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const today = useAppTodayKey()
  const tasks = useTaskStore((s) => s.tasks)
  const savedTimetable = useTaskStore((s) => s.timetable)
  const saveTimetable = useTaskStore((s) => s.saveTimetable)
  const addTimetableClass = useTaskStore((s) => s.addTimetableClass)
  const updateTimetableClass = useTaskStore((s) => s.updateTimetableClass)
  const deleteEventSeries = useTaskStore((s) => s.deleteEventSeries)
  const [title, setTitle] = useState(current?.title ?? '')
  const [color, setColor] = useState<string | null>(current?.color ?? null)
  const colorText = usePlanColorText(color)
  const courses = useMemo(() => lmsCourses(tasks), [tasks])
  const inputRef = useRef<HTMLInputElement>(null)
  const weekdayLabels = t('habits.weekdays', { returnObjects: true }) as string[]
  const place = t('timetable.cellPlace', { weekday: weekdayLabels[weekday - 1], n: periodIndex + 1 })
  const sep = t('common.timeRangeSeparator')

  const from = classStartDate(timetable, today)
  const until = timetable.termEnd ?? defaultSeriesUntil(from)
  const dates = current ? [] : seriesDates(from, { weekdays: [weekday], until, skipHolidays: timetable.skipHolidays })
  const count = current ? current.count : dates.length

  const save = () => {
    const name = title.trim()
    if (!name) return
    if (current) {
      updateTimetableClass(current.firstTaskId, { title: name, color })
    } else {
      // 案のままの学期は、授業を入れたときに保存する（ほかの端末でも同じ学期になる）
      if (!savedTimetable.termStart || !savedTimetable.termEnd) saveTimetable(timetable)
      addTimetableClass({ weekday, startTime: period.start, endTime: period.end, title: name, color })
    }
    onClose()
  }

  const remove = async () => {
    if (!current) return
    if (
      !(await askConfirm({
        message: t('timetable.removeConfirm', { title: current.title, count: current.count }),
        confirmLabel: t('common.delete'),
        danger: true,
      }))
    )
      return
    deleteEventSeries(current.firstTaskId, 'following')
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
          onChange={(e) => setTitle(e.target.value)}
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
          onChoose={setColor}
          defaultLabel={t('labels.none')}
          defaultHex={NEUTRAL_HEX}
          label={t('labels.pickerAria')}
        />
      </div>
      {!current && count === 0 && (
        <p role="alert" className={`mt-3 ${ERROR_TEXT}`}>
          {t('timetable.noDays')}
        </p>
      )}
      <div className="mt-5 flex items-center gap-2">
        {current && (
          <button type="button" onClick={() => void remove()} className={buttonClass({ variant: 'danger', size: 'md' })}>
            {t('common.delete')}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onClose} className={buttonClass({ variant: 'ghost', size: 'md' })}>
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
