import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { isEventTask, type Priority, type Task } from '../../types/task'
import { PillToggle } from '../ui/PillToggle'
import { addClockMinutes } from '../../lib/clockTime'
import { PRIORITY_TEXT_CLASS } from '../../lib/priorityColor'
import { useDateFormat } from '../../hooks/useDateFormat'
import { DueDatePopover } from '../DueDatePopover'
import { TimeInput } from '../TimeInput'
import { TaskTimeZoneButton, TaskTimeZoneNote } from '../TaskTimeZoneField'
import { TaskRemindersField } from '../TaskRemindersField'
import { CalendarIcon, ClockIcon } from '../icons'
import { fieldClass } from '../ui/fieldClass'
import { sectionLabelClass } from '../ui/sectionLabelClass'
import { TaskRecurrenceField } from './TaskRecurrenceField'
import { useTaskTimes } from './useTaskTimes'
import { TaskEstimateField } from './TaskEstimateField'
import { EventRepeatField } from './EventRepeatField'

const PRIORITY_OPTIONS: Priority[] = ['none', 'low', 'medium', 'high']

/**
 * 予定を立てるタスク（いつか・チェックリスト・記録以外）の欄: To-Do／予定・優先度・締切（時刻・繰り返し）・やる日（時間帯）・見積もり・タイムゾーン・通知。
 * 予定（完了の丸の無いもの）には優先度・締切・繰り返しを出さない
 */
export function TaskPlanFields({ task }: { task: Task }) {
  const { t } = useTranslation()
  const df = useDateFormat()
  const updateTask = useTaskStore((s) => s.updateTask)
  const defaultBlockMinutes = useTaskStore((s) => s.defaultBlockMinutes)
  // サブタスクのある・サブタスクの行は To-Do のまま（予定は To-Do の一覧に出ないので、親子が見えなくなる）
  const hasChildren = useTaskStore((s) => s.tasks.some((x) => x.parentId === task.id && !x.deletedAt))
  const { tv, updateTimes, tzOnScheduled, tzOnDeadline, tzLoose } = useTaskTimes(task)
  const isEvent = isEventTask(task)
  return (
    <>
      {/* 毎週の予定の回は予定のまま（To-Do にすると回の並びから外れる。やめるのは「繰り返さない」） */}
      {!task.parentId && !hasChildren && !(isEvent && task.series) && (
        <PillToggle
          ariaLabel={t('quickCreate.kind')}
          options={[
            { value: 'event', label: t('quickCreate.kindEvent') },
            { value: 'todo', label: t('quickCreate.kindTodo') },
          ]}
          value={isEvent ? 'event' : 'todo'}
          onChange={(kind) => updateTask(task.id, { kind })}
        />
      )}
      {!isEvent && (
        <div>
          <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.priority')}</label>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => updateTask(task.id, { priority: p })}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors
                ${
                  task.priority === p
                    ? 'border-accent-400 bg-accent-50 dark:bg-accent-500/10 font-medium'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                }
                ${PRIORITY_TEXT_CLASS[p]}`}
              >
                {t(`common.${p}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isEvent && (
        <div>
          <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.deadline')}</label>
          <div className="flex flex-wrap items-center gap-2">
            <DueDatePopover
              value={tv.dueDate ?? null}
              onChange={(v) => updateTimes({ dueDate: v })}
              align="left"
              wrapperClassName="relative inline-block"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-haspopup="dialog"
                  onClick={toggle}
                  className={fieldClass({ active: open }, 'flex items-center gap-2')}
                >
                  <CalendarIcon className={`w-4 h-4 ${tv.dueDate ? 'text-date-500' : 'text-zinc-400'}`} />
                  <span className={tv.dueDate ? '' : 'text-zinc-400 dark:text-zinc-500'}>
                    {tv.dueDate ? df.fullDate(tv.dueDate) : t('dueDatePicker.noDate')}
                  </span>
                </button>
              )}
            />
            {tv.dueDate && (
              <div className="flex items-center gap-1.5">
                <span className={sectionLabelClass('field')}>{t('taskDetail.deadlineTime')}</span>
                <TimeInput
                  value={tv.dueTime ?? ''}
                  onChange={(v) => updateTimes({ dueTime: v || null })}
                  className={fieldClass({}, 'w-[7rem]')}
                />
              </div>
            )}
            {tzOnDeadline && <TaskTimeZoneButton task={task} view={tv} />}
          </div>
          {tzOnDeadline && <TaskTimeZoneNote task={task} />}
          {/* 繰り返しは締切のあるタスクだけ */}
          {task.dueDate && <TaskRecurrenceField task={task} dueDate={task.dueDate} />}
        </div>
      )}

      <div>
        <label className={sectionLabelClass('field', 'mb-2 block')}>{t('taskDetail.scheduled')}</label>
        <DueDatePopover
          value={tv.scheduledDate ?? null}
          onChange={(v) => updateTimes({ scheduledDate: v })}
          kind="scheduled"
          align="left"
          wrapperClassName="relative inline-block"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={toggle}
              className={fieldClass({ active: open }, 'flex items-center gap-2')}
            >
              <ClockIcon className={`w-4 h-4 ${tv.scheduledDate ? 'text-date-500' : 'text-zinc-400'}`} />
              <span className={tv.scheduledDate ? '' : 'text-zinc-400 dark:text-zinc-500'}>
                {tv.scheduledDate ? df.fullDate(tv.scheduledDate) : t('taskDetail.scheduledNone')}
              </span>
            </button>
          )}
        />
        {tv.scheduledDate && (
          <div className="mt-2 flex items-center gap-2">
            <TimeInput
              value={tv.startTime ?? ''}
              onChange={(v) => updateTimes({ startTime: v || null })}
              className={fieldClass({}, 'w-[7rem]')}
            />
            <span className="text-zinc-400 text-sm">{t('common.timeRangeSeparator')}</span>
            <TimeInput
              value={tv.endTime ?? ''}
              onChange={(v) => updateTimes({ endTime: v || null })}
              pickerDefault={tv.startTime ? addClockMinutes(tv.startTime, task.estimateMinutes ?? defaultBlockMinutes) : undefined}
              className={fieldClass({}, 'w-[7rem]')}
            />
            {tzOnScheduled && <TaskTimeZoneButton task={task} view={tv} />}
          </div>
        )}
        {tzOnScheduled && <TaskTimeZoneNote task={task} />}
      </div>
      {/* 予定の繰り返し（毎週・終わりの日つき、#279）。To-Do の繰り返しは締切の欄 */}
      {isEvent && task.scheduledDate && <EventRepeatField task={task} date={task.scheduledDate} />}
      {/* 予定は時刻で長さが決まっているので、見積もりは To-Do だけ */}
      {!isEvent && <TaskEstimateField task={task} />}
      {tzLoose && (
        <div>
          <TaskTimeZoneButton task={task} view={tv} />
          <TaskTimeZoneNote task={task} />
        </div>
      )}
      <TaskRemindersField task={task} />
    </>
  )
}
