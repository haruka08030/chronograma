import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { requestPermission } from '../lib/notifications'
import { isIosBrowserNotInstalled } from '../lib/onboardingNudge'
import { SettingsGroup, SettingsLinkRow, SettingsRow, Switch } from './settings/SettingsPrimitives'
import { fieldClass } from './ui/fieldClass'
import { formatDuration } from '../lib/timeGrid'
import { DEFAULT_BLOCK_OPTIONS } from '../lib/defaultBlock'

const CAPACITY_HOURS = [4, 5, 6, 7, 8, 9, 10, 12]
const EVENT_REMINDER_OPTIONS = [5, 10, 15, 30, 60]
/** 夜の締めをオンにしたときの時刻 */
const DEFAULT_WRAP_UP_TIME = '22:00'

const selectClass = fieldClass({ size: 'sm' })

/**
 * 設定「通知」: 放っておくと逃すことを、手を打てるときだけ知らせる。
 * 朝のまとめ・予定の前・締切の前・予定のあとの記録の確認・夜の締め（タイマーの止め忘れは常に）。
 * 1 日に計画する時間の目安・既定の予定の長さは通知ではないので別のまとまり（計画）。
 */
export function DailyRhythmSettings() {
  const { t } = useTranslation()
  const dailyReminders = useTaskStore((s) => s.dailyReminders)
  const setDailyReminders = useTaskStore((s) => s.setDailyReminders)
  const dailyCapacityMinutes = useTaskStore((s) => s.dailyCapacityMinutes)
  const setDailyCapacityMinutes = useTaskStore((s) => s.setDailyCapacityMinutes)
  const defaultBlockMinutes = useTaskStore((s) => s.defaultBlockMinutes)
  const setDefaultBlockMinutes = useTaskStore((s) => s.setDefaultBlockMinutes)
  const notificationsEnabled = useTaskStore((s) => s.notificationsEnabled)
  const toggleNotifications = useTaskStore((s) => s.toggleNotifications)
  const eventReminderMinutes = useTaskStore((s) => s.eventReminderMinutes)
  const setEventReminderMinutes = useTaskStore((s) => s.setEventReminderMinutes)
  const recordPrompts = useTaskStore((s) => s.recordPrompts)
  const setRecordPrompts = useTaskStore((s) => s.setRecordPrompts)
  const unsupported = typeof window === 'undefined' || !('Notification' in window)
  const denied = !unsupported && Notification.permission === 'denied'
  const off = unsupported || denied
  // iPhone / iPad の Safari は、ホーム画面に追加して開くと通知が使える（「対応していません」ではない）
  const needsInstall = unsupported && isIosBrowserNotInstalled()

  /** オンにするときだけ通知の許可を聞く */
  const turnOn = async (apply: () => void) => {
    if (await requestPermission()) apply()
  }

  return (
    <>
      <SettingsGroup
        id="settings-rhythm"
        title={t('settings.notificationsTitle')}
        description={
          needsInstall
            ? undefined
            : unsupported
              ? t('settings.notificationsUnsupported')
              : denied
                ? t('settings.notificationsDenied')
                : undefined
        }
      >
        {needsInstall && (
          <SettingsLinkRow
            label={t('settings.notificationsNeedInstall')}
            hint={t('settings.notificationsNeedInstallHint')}
            onClick={() => document.getElementById('settings-app')?.scrollIntoView({ block: 'start' })}
          />
        )}
        <SettingsRow label={t('settings.morningSummary')}>
          {dailyReminders.planTime && (
            <input
              type="time"
              value={dailyReminders.planTime}
              onChange={(e) => e.target.value && setDailyReminders({ planTime: e.target.value })}
              aria-label={t('settings.morningSummary')}
              className={selectClass}
            />
          )}
          <Switch
            checked={Boolean(dailyReminders.planTime)}
            disabled={off}
            onChange={(on) => (on ? void turnOn(() => setDailyReminders({ planTime: '08:00' })) : setDailyReminders({ planTime: null }))}
            label={t('settings.morningSummary')}
          />
        </SettingsRow>
        <SettingsRow label={t('settings.eventReminder')} htmlFor="event-reminder">
          <select
            id="event-reminder"
            value={eventReminderMinutes ?? 'off'}
            disabled={off}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'off') return setEventReminderMinutes(null)
              void turnOn(() => setEventReminderMinutes(Number(v)))
            }}
            className={selectClass}
          >
            <option value="off">{t('settings.eventReminderOff')}</option>
            {EVENT_REMINDER_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {t('settings.eventReminderBefore', { count: m })}
              </option>
            ))}
          </select>
        </SettingsRow>
        <SettingsRow label={t('settings.dueNotifications')}>
          <Switch
            checked={notificationsEnabled}
            disabled={off}
            onChange={(on) => (on ? void turnOn(toggleNotifications) : toggleNotifications())}
            label={t('settings.dueNotifications')}
          />
        </SettingsRow>
        <SettingsRow label={t('settings.recordPrompts')}>
          <Switch
            checked={recordPrompts}
            disabled={off}
            onChange={(on) => (on ? void turnOn(() => setRecordPrompts(true)) : setRecordPrompts(false))}
            label={t('settings.recordPrompts')}
          />
        </SettingsRow>
        <SettingsRow label={t('settings.wrapUpReminder')}>
          {dailyReminders.wrapUpTime && (
            <input
              type="time"
              value={dailyReminders.wrapUpTime}
              onChange={(e) => e.target.value && setDailyReminders({ wrapUpTime: e.target.value })}
              aria-label={t('settings.wrapUpReminder')}
              className={selectClass}
            />
          )}
          <Switch
            checked={Boolean(dailyReminders.wrapUpTime)}
            disabled={off}
            onChange={(on) =>
              on ? void turnOn(() => setDailyReminders({ wrapUpTime: DEFAULT_WRAP_UP_TIME })) : setDailyReminders({ wrapUpTime: null })
            }
            label={t('settings.wrapUpReminder')}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup id="settings-planning" title={t('settings.planningTitle')}>
        <SettingsRow label={t('settings.dailyCapacity')} htmlFor="daily-capacity">
          <select
            id="daily-capacity"
            value={Math.round(dailyCapacityMinutes / 60)}
            onChange={(e) => setDailyCapacityMinutes(Number(e.target.value) * 60)}
            className={selectClass}
          >
            {CAPACITY_HOURS.map((h) => (
              <option key={h} value={h}>
                {t('settings.capacityHours', { count: h })}
              </option>
            ))}
          </select>
        </SettingsRow>
        <SettingsRow label={t('settings.defaultBlock')} htmlFor="default-block">
          <select
            id="default-block"
            value={defaultBlockMinutes}
            onChange={(e) => setDefaultBlockMinutes(Number(e.target.value))}
            className={selectClass}
          >
            {DEFAULT_BLOCK_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {formatDuration(m)}
              </option>
            ))}
          </select>
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}
