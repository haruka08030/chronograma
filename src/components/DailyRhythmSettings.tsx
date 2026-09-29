import { useTranslation } from 'react-i18next'
import { useTaskStore, type DailyReminders } from '../store/taskStore'
import { requestPermission } from '../lib/notifications'

const CAPACITY_HOURS = [4, 5, 6, 7, 8, 9, 10, 12]

/** 設定: 朝の計画・夕方の締めの通知時刻と、1 日に計画する時間の目安 */
export function DailyRhythmSettings() {
  const { t } = useTranslation()
  const dailyReminders = useTaskStore((s) => s.dailyReminders)
  const setDailyReminders = useTaskStore((s) => s.setDailyReminders)
  const dailyCapacityMinutes = useTaskStore((s) => s.dailyCapacityMinutes)
  const setDailyCapacityMinutes = useTaskStore((s) => s.setDailyCapacityMinutes)
  const unsupported = typeof window === 'undefined' || !('Notification' in window)
  const denied = !unsupported && Notification.permission === 'denied'

  const toggle = async (key: keyof DailyReminders, fallback: string) => {
    if (dailyReminders[key]) {
      setDailyReminders({ [key]: null })
      return
    }
    if (await requestPermission()) setDailyReminders({ [key]: fallback })
  }

  const row = (key: keyof DailyReminders, label: string, fallback: string) => {
    const value = dailyReminders[key]
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <label className="flex min-w-0 items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={unsupported || denied}
            onChange={() => void toggle(key, fallback)}
            className="h-4 w-4 rounded border-zinc-300 accent-accent-600"
          />
          {label}
        </label>
        <input
          type="time"
          value={value ?? fallback}
          disabled={!value}
          onChange={(e) => e.target.value && setDailyReminders({ [key]: e.target.value })}
          aria-label={label}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-800 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>
    )
  }

  return (
    <section
      id="settings-daily-rhythm"
      className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <h2 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">{t('settings.dailyRhythmTitle')}</h2>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{t('settings.dailyRhythmHelp')}</p>
      {row('planTime', t('settings.planReminder'), '08:30')}
      {row('wrapUpTime', t('settings.wrapUpReminder'), '18:00')}
      {(unsupported || denied) && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          {unsupported ? t('settings.notificationsUnsupported') : t('settings.notificationsDenied')}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <label htmlFor="daily-capacity" className="text-sm text-zinc-700 dark:text-zinc-300">
          {t('settings.dailyCapacity')}
        </label>
        <select
          id="daily-capacity"
          value={Math.round(dailyCapacityMinutes / 60)}
          onChange={(e) => setDailyCapacityMinutes(Number(e.target.value) * 60)}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          {CAPACITY_HOURS.map((h) => (
            <option key={h} value={h}>
              {t('settings.capacityHours', { count: h })}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
