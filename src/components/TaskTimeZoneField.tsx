import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import type { Task } from '../types/task'
import { appTimeZone, gmtLabel, zoneCityName, zoneLongName } from '../lib/timeZone'
import { foreignTimeZone, timesPatchFromZone, type TaskTimeFields } from '../lib/taskTimeZone'
import { TimeZonePicker } from './TimeZonePicker'
import { GlobeIcon } from './icons'
import { tip } from '../lib/tooltip'
import { fromDateKey } from '../lib/dateKey'

/**
 * 詳細の「タイムゾーン」（Google カレンダーの予定のタイムゾーンと同じ）。
 * 時刻の行の末尾に置く小さなボタン。アプリと同じなら地球のアイコンだけ、違えば `GMT-4 New York` のように出す。
 * 選ぶと、見えている時刻の数字はそのままで、そのタイムゾーンの時刻になる。
 */
export function TaskTimeZoneButton({ task, view, compact = false }: {
  task: Task
  view: TaskTimeFields
  /** 見出しの横など、入力欄の高さに合わせないところ */
  compact?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('ja') ? 'ja' : 'en'
  const updateTask = useTaskStore((s) => s.updateTask)
  useTaskStore((s) => s.appTimeZone)
  const app = appTimeZone()
  const zone = foreignTimeZone(task)

  return (
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
          aria-label={t('timeZone.field')}
          {...tip(t('timeZone.field'))}
          onClick={toggle}
          className={`flex ${compact ? 'h-6' : 'h-[38px]'} min-w-0 items-center gap-1.5 rounded-lg px-2 text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
            zone ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
          }`}
        >
          <GlobeIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          {zone && <span className="truncate">{`${gmtLabel(zone)} ${zoneCityName(zone)}`}</span>}
        </button>
      )}
    />
  )
}

/** アプリと違うタイムゾーンのとき、アプリのタイムゾーンでは何時かを時刻の行の下に出す */
export function TaskTimeZoneNote({ task }: { task: Task }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('ja') ? 'ja' : 'en'
  useTaskStore((s) => s.appTimeZone)
  const zone = foreignTimeZone(task)
  if (!zone) return null

  const day = (ymd: string) => format(fromDateKey(ymd), 'M/d')
  const date = task.isTimeLog ? task.dueDate : task.scheduledDate
  let when: string | null = null
  if (date && task.startTime) {
    const end = task.endTime ? `–${task.endDate && task.endDate !== date ? `${day(task.endDate)} ` : ''}${task.endTime}` : ''
    when = `${day(date)} ${task.startTime}${end}`
  } else if (task.dueDate && task.dueTime) {
    when = `${day(task.dueDate)} ${task.dueTime}`
  }
  if (!when) return null

  return (
    <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
      {t('timeZone.inApp', { zone: zoneLongName(appTimeZone(), locale), when })}
    </p>
  )
}
