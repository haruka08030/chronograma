import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { installAvailability, promptInstall, subscribeInstallAvailability } from '../lib/pwa'
import { SettingsRow } from './settings/SettingsPrimitives'
import { buttonClass } from './ui/buttonClass'

/** 設定の 1 行: ホーム画面 / Dock に追加して「アプリとして」使う案内 */
export function InstallAppSection() {
  const { t } = useTranslation()
  const availability = useSyncExternalStore(subscribeInstallAvailability, installAvailability, () => 'unavailable' as const)

  if (availability === 'installed') {
    return <SettingsRow label={t('install.title')} help={t('install.installed')} />
  }
  if (availability === 'prompt') {
    return (
      <SettingsRow label={t('install.title')}>
        <button type="button" onClick={() => void promptInstall()} className={buttonClass({ variant: 'secondary', size: 'md' })}>
          {t('install.button')}
        </button>
      </SettingsRow>
    )
  }
  return (
    <SettingsRow
      label={t('install.title')}
      help={
        availability === 'ios' ? (
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>{t('install.iosStep1')}</li>
            <li>{t('install.iosStep2')}</li>
            <li>{t('install.iosStep3')}</li>
          </ol>
        ) : (
          t('install.manual')
        )
      }
    />
  )
}
