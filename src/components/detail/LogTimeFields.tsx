import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import type { Task } from '../../types/task'
import { addClockMinutes } from '../../lib/clockTime'
import { formatDuration } from '../../lib/timeGrid'
import { durationMinutesForTaskSlot, isOvernightTimeLog } from '../../lib/taskTimeRange'
import { DateField } from '../DateField'
import { TimeInput } from '../TimeInput'
import { TaskTimeZoneButton, TaskTimeZoneNote } from '../TaskTimeZoneField'
import { SectionLabel } from '../ui/SectionLabel'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { HINT_TEXT, META_TEXT } from '../ui/textClass'
import { useTaskTimes } from './useTaskTimes'

/** 記録の開始・終了（日付と時刻）と長さ。日をまたぐ記録は終了の日付を変えられる */
export function LogTimeFields({ task }: { task: Task }) {
  const { t } = useTranslation()
  const { zone, tv, updateTimes } = useTaskTimes(task)
  const logDurationLabel = useMemo(() => {
    if (!task.startTime || !task.endTime) return null
    const mins = durationMinutesForTaskSlot(task)
    if (mins == null || mins <= 0) return null
    return formatDuration(mins)
  }, [task])
  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30
                       p-3 space-y-2"
      >
        <div className="flex items-center justify-between">
          <SectionLabel as="p" level="field">
            {t('common.start')}
          </SectionLabel>
          {(task.startTime || zone) && <TaskTimeZoneButton task={task} view={tv} compact />}
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[10.5rem] flex-1">
            <label className={sectionLabelClass('field')}>{t('taskDetail.logDate')}</label>
            <DateField
              value={tv.dueDate ?? null}
              onChange={(v) => updateTimes({ dueDate: v })}
              ariaLabel={t('taskDetail.logDate')}
              className={fieldClass({}, 'w-full')}
            />
          </div>
          <div className="flex flex-col gap-1 w-[7.5rem] shrink-0">
            <label className={sectionLabelClass('field')}>{t('taskDetail.time')}</label>
            <TimeInput
              value={tv.startTime ?? ''}
              onChange={(v) => updateTimes({ startTime: v || null })}
              className={fieldClass({}, 'w-full')}
            />
          </div>
        </div>
      </div>

      <div
        className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30
                       p-3 space-y-2"
      >
        <SectionLabel as="p" level="field">
          {t('common.end')}
        </SectionLabel>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[10.5rem] flex-1">
            <label className={sectionLabelClass('field')}>{t('taskDetail.logEndDate')}</label>
            <DateField
              value={tv.dueDate ? (tv.endDate ?? tv.dueDate) : null}
              min={tv.dueDate ?? undefined}
              disabled={!tv.dueDate}
              onChange={(v) => {
                if (!tv.dueDate) return
                updateTimes({ endDate: v !== tv.dueDate ? v : null })
              }}
              ariaLabel={t('taskDetail.logEndDate')}
              className={fieldClass({}, 'w-full')}
            />
          </div>
          <div className="flex flex-col gap-1 w-[7.5rem] shrink-0">
            <label className={sectionLabelClass('field')}>{t('taskDetail.time')}</label>
            <TimeInput
              value={tv.endTime ?? ''}
              onChange={(v) => updateTimes({ endTime: v || null })}
              pickerDefault={tv.startTime ? addClockMinutes(tv.startTime, 60) : undefined}
              className={fieldClass({}, 'w-full')}
            />
          </div>
        </div>
      </div>

      {logDurationLabel && <p className={META_TEXT}>{t('taskDetail.logDuration', { label: logDurationLabel })}</p>}
      {isOvernightTimeLog(task) && <p className={HINT_TEXT}>{t('activityLog.overnightHint')}</p>}
      <TaskTimeZoneNote task={task} />
    </div>
  )
}
