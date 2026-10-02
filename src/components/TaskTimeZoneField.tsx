import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import { appTimeZone, zoneLongName, zoneOptionLabel } from '../lib/timeZone'
import { foreignTimeZone, timesPatchFromZone, type TaskTimeFields } from '../lib/taskTimeZone'
import { TimeZonePicker } from './TimeZonePicker'

/**
 * 詳細の「タイムゾーン」（Google カレンダーの予定のタイムゾーンと同じ）。
 * 選ぶと、見えている時刻の数字はそのままで、そのタイムゾーンの時刻になる。
 * アプリと違うタイムゾーンなら、アプリのタイムゾーンでは何時かを下に出す。
 */
export function TaskTimeZoneField({ task, view }: { task: Task; view: TaskTimeFields }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('ja') ? 'ja' : 'en'
  const updateTask = useTaskStore((s) => s.updateTask)
  useTaskStore((s) => s.appTimeZone)
  const app = appTimeZone()
  const zone = foreignTimeZone(task)

  const when = (() => {
    if (!zone) return null
    const day = (ymd: string) => format(parseISO(`${ymd}T12:00:00`), 'M/d')
    const date = task.isTimeLog ? task.dueDate : task.scheduledDate
    if (date && task.startTime) {
      const end = task.endTime ? `–${task.endDate && task.endDate !== date ? `${day(task.endDate)} ` : ''}${task.endTime}` : ''
      return `${day(date)} ${task.startTime}${end}`
    }
    if (task.dueDate && task.dueTime) return `${day(task.dueDate)} ${task.dueTime}`
    return null
  })()

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <TimeZonePicker
        ariaLabel={t('timeZone.field')}
        value={zone}
        nullOption={t('timeZone.useApp', { zone: zoneLongName(app, locale) })}
        onChange={(tz) => {
          const next = tz && tz !== app ? tz : null
          updateTask(task.id, { ...timesPatchFromZone(view, {}, next ?? app), timeZone: next })
        }}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={toggle}
            className={`flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
              zone ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.5-2.4 3.75-5.4 3.75-9S14.5 5.4 12 3m0 18c-2.5-2.4-3.75-5.4-3.75-9S9.5 5.4 12 3M3.5 9h17M3.5 15h17" />
            </svg>
            <span className="truncate">{zone ? zoneOptionLabel(zone, locale) : t('timeZone.set')}</span>
          </button>
        )}
      />
      {zone && when && (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{t('timeZone.inApp', { zone: zoneLongName(app, locale), when })}</span>
      )}
    </div>
  )
}
