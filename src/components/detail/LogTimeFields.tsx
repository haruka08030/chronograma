import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import type { Task } from '../../types/task'
import { addClockMinutes } from '../../lib/clockTime'
import { formatDuration } from '../../lib/timeGrid'
import { durationMinutesForTaskSlot, endDateAfterStartDateEdit, isOvernightTimeLog } from '../../lib/taskTimeRange'
import { DateField } from '../DateField'
import { TimeInput } from '../TimeInput'
import { TaskTimeZoneButton, TaskTimeZoneNote } from '../TaskTimeZoneField'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { HINT_TEXT, META_TEXT } from '../ui/textClass'
import { useTaskTimes } from './useTaskTimes'

/**
 * 記録の日付と時刻（To-Do の実行日と同じ形: 日付の下に 開始 〜 終了 と長さ）。
 * 終わりが開始以前の時刻なら翌日まで。日をまたぐ記録だけ終了日を出して変えられる
 */
export function LogTimeFields({ task }: { task: Task }) {
  const { t } = useTranslation()
  const { zone, tv, updateTimes } = useTaskTimes(task)
  const overnight = isOvernightTimeLog(task)
  const logDurationLabel = useMemo(() => {
    if (!task.startTime || !task.endTime) return null
    const mins = durationMinutesForTaskSlot(task)
    if (mins == null || mins <= 0) return null
    return formatDuration(mins)
  }, [task])
  return (
    <div>
      <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.logDate')}</label>
      <DateField
        value={tv.dueDate ?? null}
        // 日をまたぐ記録は終わりの日も同じ日数ずらす
        onChange={(v) => updateTimes(v ? { dueDate: v, endDate: endDateAfterStartDateEdit(tv.dueDate, tv.endDate, v) } : { dueDate: v })}
        ariaLabel={t('taskDetail.logDate')}
        className={fieldClass({}, 'w-[12rem]')}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TimeInput
          value={tv.startTime ?? ''}
          onChange={(v) => updateTimes({ startTime: v || null })}
          ariaLabel={t('common.start')}
          className={fieldClass({}, 'w-[7rem]')}
        />
        <span className="text-zinc-400 text-sm">{t('common.timeRangeSeparator')}</span>
        <TimeInput
          value={tv.endTime ?? ''}
          onChange={(v) => updateTimes({ endTime: v || null })}
          pickerDefault={tv.startTime ? addClockMinutes(tv.startTime, 60) : undefined}
          ariaLabel={t('common.end')}
          className={fieldClass({}, 'w-[7rem]')}
        />
        {(task.startTime || zone) && <TaskTimeZoneButton task={task} view={tv} />}
        {logDurationLabel && <span className={META_TEXT}>{logDurationLabel}</span>}
      </div>
      {overnight && (
        <div className="mt-2 flex items-center gap-2">
          <span className={sectionLabelClass('field')}>{t('taskDetail.logEndDate')}</span>
          <DateField
            value={tv.dueDate ? (tv.endDate ?? tv.dueDate) : null}
            min={tv.dueDate ?? undefined}
            disabled={!tv.dueDate}
            onChange={(v) => {
              if (!tv.dueDate) return
              updateTimes({ endDate: v !== tv.dueDate ? v : null })
            }}
            ariaLabel={t('taskDetail.logEndDate')}
            className={fieldClass({}, 'w-[12rem]')}
          />
        </div>
      )}
      {overnight && <p className={`mt-2 ${HINT_TEXT}`}>{t('activityLog.overnightHint')}</p>}
      <TaskTimeZoneNote task={task} />
    </div>
  )
}
