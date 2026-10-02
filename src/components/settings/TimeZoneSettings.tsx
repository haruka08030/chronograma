import { useTranslation } from 'react-i18next'
import { MAX_EXTRA_TIME_ZONES, useTaskStore } from '../../store/taskStore'
import { deviceTimeZone, zoneLongName, zoneOptionLabel } from '../../lib/timeZone'
import { TimeZonePicker } from '../TimeZonePicker'
import { SettingsGroup, SettingsRow, settingsButton } from './SettingsPrimitives'
import { CloseIcon } from '../icons'

/** 設定「日付と時刻」: アプリのタイムゾーンと、時間バーに並べる他のタイムゾーン（Google カレンダーと同じ） */
export function TimeZoneSettings() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('ja') ? 'ja' : 'en'
  const zone = useTaskStore((s) => s.appTimeZone)
  const setZone = useTaskStore((s) => s.setAppTimeZone)
  const extra = useTaskStore((s) => s.extraTimeZones)
  const setExtra = useTaskStore((s) => s.setExtraTimeZones)
  const device = deviceTimeZone()

  return (
    <SettingsGroup id="settings-time-zone" title={t('timeZone.title')}>
      <SettingsRow label={t('timeZone.primary')}>
        <TimeZonePicker
          ariaLabel={t('timeZone.primary')}
          value={zone}
          onChange={setZone}
          nullOption={t('timeZone.autoWith', { zone: zoneLongName(device, locale) })}
        />
      </SettingsRow>
      <SettingsRow label={t('timeZone.extra')}>
        {extra.length < MAX_EXTRA_TIME_ZONES && (
          <TimeZonePicker
            ariaLabel={t('timeZone.add')}
            value={null}
            exclude={[...extra, zone ?? device]}
            onChange={(tz) => tz && setExtra([...extra, tz])}
            trigger={({ open, toggle }) => (
              <button type="button" aria-expanded={open} onClick={toggle} className={settingsButton}>
                {t('timeZone.add')}
              </button>
            )}
          />
        )}
      </SettingsRow>
      {extra.map((tz) => (
        <div key={tz} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="min-w-0 truncate text-sm text-zinc-700 dark:text-zinc-200">{zoneOptionLabel(tz, locale)}</span>
          <button
            type="button"
            aria-label={t('timeZone.remove', { zone: zoneOptionLabel(tz, locale) })}
            onClick={() => setExtra(extra.filter((z) => z !== tz))}
            className="shrink-0 rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </SettingsGroup>
  )
}
