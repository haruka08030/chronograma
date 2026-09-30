import { useTranslation } from 'react-i18next'
import { useTaskStore, type DailyReminders } from '../store/taskStore'
import { requestPermission } from '../lib/notifications'
import { SettingsGroup, SettingsRow, Switch } from './settings/SettingsPrimitives'

const CAPACITY_HOURS = [4, 5, 6, 7, 8, 9, 10, 12]

/** 設定「通知と 1 日のリズム」: 朝の計画・夕方の締め・締切の通知・1 日に計画する時間の目安 */
export function DailyRhythmSettings() {
  const { t } = useTranslation()
  const dailyReminders = useTaskStore((s) => s.dailyReminders)
  const setDailyReminders = useTaskStore((s) => s.setDailyReminders)
  const dailyCapacityMinutes = useTaskStore((s) => s.dailyCapacityMinutes)
  const setDailyCapacityMinutes = useTaskStore((s) => s.setDailyCapacityMinutes)
  const notificationsEnabled = useTaskStore((s) => s.notificationsEnabled)
  const toggleNotifications = useTaskStore((s) => s.toggleNotifications)
  const unsupported = typeof window === 'undefined' || !('Notification' in window)
  const denied = !unsupported && Notification.permission === 'denied'

  const toggle = async (key: keyof DailyReminders, fallback: string) => {
    if (dailyReminders[key]) {
      setDailyReminders({ [key]: null })
      return
    }
    if (await requestPermission()) setDailyReminders({ [key]: fallback })
  }

  const reminderRow = (key: keyof DailyReminders, label: string, help: string, fallback: string) => {
    const value = dailyReminders[key]
    return (
      <SettingsRow label={label} help={help}>
        {value && (
          <input
            type="time"
            value={value}
            onChange={(e) => e.target.value && setDailyReminders({ [key]: e.target.value })}
            aria-label={label}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        )}
        <Switch checked={Boolean(value)} disabled={unsupported || denied} onChange={() => void toggle(key, fallback)} label={label} />
      </SettingsRow>
    )
  }

  return (
    <SettingsGroup
      id="settings-rhythm"
      title={t('settings.dailyRhythmTitle')}
      description={unsupported ? t('settings.notificationsUnsupported') : denied ? t('settings.notificationsDenied') : t('settings.dailyRhythmHelp')}
    >
      {reminderRow('planTime', t('settings.planReminder'), t('settings.planReminderHelp'), '08:30')}
      {reminderRow('wrapUpTime', t('settings.wrapUpReminder'), t('settings.wrapUpReminderHelp'), '18:00')}
      <SettingsRow label={t('settings.dueNotifications')} help={t('settings.dueNotificationsHelp')}>
        <Switch checked={notificationsEnabled} disabled={unsupported || denied} onChange={toggleNotifications} label={t('settings.dueNotifications')} />
      </SettingsRow>
      <SettingsRow label={t('settings.dailyCapacity')} help={t('settings.dailyCapacityHelp')} htmlFor="daily-capacity">
        <select
          id="daily-capacity"
          value={Math.round(dailyCapacityMinutes / 60)}
          onChange={(e) => setDailyCapacityMinutes(Number(e.target.value) * 60)}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          {CAPACITY_HOURS.map((h) => (
            <option key={h} value={h}>
              {t('settings.capacityHours', { count: h })}
            </option>
          ))}
        </select>
      </SettingsRow>
    </SettingsGroup>
  )
}
