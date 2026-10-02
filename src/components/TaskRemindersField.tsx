import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import {
  applicableReminders,
  effectiveReminders,
  type TaskReminder,
} from '../../supabase/functions/daily-reminders/schedule.ts'
import { toReminderTask } from '../lib/localReminders'
import { CloseIcon } from './icons'

/** 追加できる通知（Google の「通知を追加」の候補を学生の使い方に寄せたもの） */
const PRESETS: TaskReminder[] = [
  { at: 'start', minutes: 0 },
  { at: 'start', minutes: 5 },
  { at: 'start', minutes: 10 },
  { at: 'start', minutes: 15 },
  { at: 'start', minutes: 30 },
  { at: 'start', minutes: 60 },
  { at: 'start', minutes: 120 },
  { at: 'start', minutes: 1440 },
  { at: 'due', minutes: 60 },
  { at: 'due', minutes: 180 },
  { at: 'dueDay', minutes: 8 * 60 },
  { at: 'dueDay', minutes: -4 * 60 },
  { at: 'dueDay', minutes: -1440 - 4 * 60 },
  { at: 'dueDay', minutes: -2 * 1440 - 4 * 60 },
  { at: 'dueDay', minutes: -6 * 1440 - 4 * 60 },
]

const same = (a: TaskReminder, b: TaskReminder) => a.at === b.at && a.minutes === b.minutes
const keyOf = (r: TaskReminder) => `${r.at}:${r.minutes}`

function lead(minutes: number, t: TFunction): string {
  if (minutes % 1440 === 0) return t('taskReminders.daysBefore', { count: minutes / 1440 })
  if (minutes % 60 === 0) return t('taskReminders.hoursBefore', { count: minutes / 60 })
  return t('taskReminders.minutesBefore', { count: minutes })
}

/** 例: 「開始 10 分前」「締切の 3 時間前」「締切の前日 20:00」「締切の 1 週間前 20:00」 */
function reminderLabel(r: TaskReminder, t: TFunction): string {
  if (r.at === 'start') return r.minutes === 0 ? t('taskReminders.startAt') : t('taskReminders.start', { lead: lead(r.minutes, t) })
  if (r.at === 'due') return r.minutes === 0 ? t('taskReminders.dueAt') : t('taskReminders.due', { lead: lead(r.minutes, t) })
  const days = Math.floor(r.minutes / 1440)
  const rest = r.minutes - days * 1440
  const time = `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`
  if (days === 0) return t('taskReminders.dueDaySame', { time })
  if (days === -1) return t('taskReminders.dueDayBefore', { time })
  if (days === -7) return t('taskReminders.dueDayWeek', { time })
  return t('taskReminders.dueDayN', { count: -days, time })
}

/**
 * 詳細の「通知」。何もしなければ設定の既定（予定の前・締切の前）を出し、足したり消したりするとこのタスクだけの通知になる。
 * 開始時刻も締切も無いタスクには出さない。
 */
export function TaskRemindersField({ task }: { task: Task }) {
  const { t } = useTranslation()
  const updateTask = useTaskStore((s) => s.updateTask)
  const eventReminderMinutes = useTaskStore((s) => s.eventReminderMinutes)
  const dueReminders = useTaskStore((s) => s.notificationsEnabled)
  const settings = { eventReminderMinutes, dueReminders, recordPrompts: false }
  const rt = toReminderTask(task)
  const current = effectiveReminders(rt, settings)
  const custom = task.reminders != null
  const addable = applicableReminders(rt, PRESETS).filter((p) => !current.some((c) => same(c, p)))
  if (current.length === 0 && addable.length === 0) return null

  const save = (next: TaskReminder[]) => updateTask(task.id, { reminders: next })

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <label htmlFor={`reminders-${task.id}`} className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {t('taskReminders.title')}
        </label>
        {custom && (
          <button
            type="button"
            onClick={() => updateTask(task.id, { reminders: null })}
            className="text-xs text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            {t('taskReminders.reset')}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {current.map((r) => (
          <span
            key={keyOf(r)}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 py-0.5 pl-2.5 pr-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
          >
            {reminderLabel(r, t)}
            <button
              type="button"
              aria-label={t('taskReminders.remove', { label: reminderLabel(r, t) })}
              onClick={() => save(current.filter((c) => !same(c, r)))}
              className="rounded-full p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        {current.length === 0 && <span className="text-xs text-zinc-400 dark:text-zinc-500">{t('taskReminders.none')}</span>}
        {addable.length > 0 && (
          <select
            id={`reminders-${task.id}`}
            value=""
            onChange={(e) => {
              const hit = addable.find((p) => keyOf(p) === e.target.value)
              if (hit) save([...current, hit])
            }}
            className="rounded-full bg-transparent px-2 py-0.5 text-xs text-accent-700 outline-none transition-colors hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-500/10"
          >
            <option value="" disabled>
              {t('taskReminders.add')}
            </option>
            {addable.map((p) => (
              <option key={keyOf(p)} value={keyOf(p)}>
                {reminderLabel(p, t)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
