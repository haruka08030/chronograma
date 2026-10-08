import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { defaultSeriesUntil, isSeriesEvent, liveSeriesRows, maxSeriesUntil, type SeriesRule } from '../../lib/eventSeries'
import { isoWeekday } from '../../lib/recurrence'
import { fromDateKey } from '../../lib/dateKey'
import { askConfirm } from '../../lib/confirmDialog'
import type { Task } from '../../types/task'
import { DateField } from '../DateField'
import { PillToggle } from '../ui/PillToggle'
import { RepeatIcon } from '../icons'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { HINT_TEXT } from '../ui/textClass'

/** 月曜から日曜（1=月 … 7=日） */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 7]

/**
 * 予定の繰り返し（毎週・曜日・終わりの日・祝日を除くか、#279）。To-Do の繰り返し（完了で次を作る）とは別で、
 * 終わりの日までの回を前もって作る（`eventSeries.ts`）。変えるとこの回から後に当てはまる（前の回はそのまま）
 */
export function EventRepeatField({ task, date }: { task: Task; date: string }) {
  const { t } = useTranslation()
  const setEventRepeat = useTaskStore((s) => s.setEventRepeat)
  const timetable = useTaskStore((s) => s.timetable)
  const labels = t('habits.weekdays', { returnObjects: true }) as string[]
  const series = isSeriesEvent(task) ? task.series : null

  const change = (patch: Partial<SeriesRule>) => {
    if (!series) return
    setEventRepeat(task.id, { weekdays: series.weekdays, until: series.until, skipHolidays: series.skipHolidays, ...patch })
  }

  const turnOff = async () => {
    if (!series) return
    const later = liveSeriesRows(useTaskStore.getState().tasks, series.id).filter((r) => (r.scheduledDate ?? '') > date).length
    if (
      later > 0 &&
      !(await askConfirm({ message: t('eventSeries.stopConfirm', { count: later }), confirmLabel: t('eventSeries.stop'), danger: true }))
    )
      return
    setEventRepeat(task.id, null)
  }

  return (
    <div>
      <label className={sectionLabelClass('field', 'mb-2 block')} htmlFor={`repeat-${task.id}`}>
        {t('eventSeries.repeat')}
      </label>
      <div className="flex items-center gap-1.5 text-sm">
        <RepeatIcon className={`h-4 w-4 shrink-0 ${series ? 'text-date-500' : 'text-zinc-400'}`} />
        <select
          id={`repeat-${task.id}`}
          value={series ? 'weekly' : 'none'}
          onChange={(e) => {
            if (e.target.value === 'none') void turnOff()
            else
              setEventRepeat(task.id, {
                weekdays: [isoWeekday(fromDateKey(date))],
                until: defaultSeriesUntil(date, timetable.termEnd),
                skipHolidays: timetable.skipHolidays,
              })
          }}
          className={fieldClass({ size: 'sm' })}
        >
          <option value="none">{t('eventSeries.none')}</option>
          <option value="weekly">{t('eventSeries.weeklyOption')}</option>
        </select>
      </div>
      {series && (
        <div className="mt-2 space-y-2 pl-5">
          <PillToggle
            ariaLabel={t('eventSeries.weekdaysAria')}
            options={WEEK_ORDER.map((d) => ({ value: d, label: labels[d - 1]! }))}
            values={series.weekdays}
            onToggle={(d) => {
              const next = series.weekdays.includes(d)
                ? series.weekdays.filter((x) => x !== d)
                : [...series.weekdays, d].sort((a, b) => a - b)
              // 最後の 1 つは外せない（やめるのは「繰り返さない」）
              if (next.length > 0) change({ weekdays: next })
            }}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={sectionLabelClass('field')}>{t('eventSeries.untilLabel')}</span>
            <DateField
              value={series.until}
              min={date}
              onChange={(v) => change({ until: v > maxSeriesUntil(date) ? maxSeriesUntil(date) : v })}
              ariaLabel={t('eventSeries.untilLabel')}
              className={fieldClass({ size: 'sm' })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={series.skipHolidays}
              onChange={(e) => change({ skipHolidays: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300"
            />
            {t('eventSeries.skipHolidays')}
          </label>
          <p className={HINT_TEXT}>{t('eventSeries.fromThisHint')}</p>
        </div>
      )}
    </div>
  )
}
