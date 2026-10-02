import { useTranslation } from 'react-i18next'
import { useGoogleConnect } from '../../hooks/useGoogleConnect'
import { isSupabaseConfigured } from '../../lib/supabase'
import { SettingsGroup, SettingsRow } from './SettingsPrimitives'
import { buttonClass } from '../ui/buttonClass'

/** Google カレンダー連携。カレンダー画面では接続中を点でしか示さないので、状態の確認と切断はここで行う */
export function GoogleCalendarSettings() {
  const { t } = useTranslation()
  const { user, clientId, connected, loading, error, connect, disconnect } = useGoogleConnect()

  if (!isSupabaseConfigured || !clientId) return null

  return (
    <SettingsGroup id="settings-google" title={t('googleSettings.title')}>
      {!user ? (
        <SettingsRow label={t('planVsActual.googleNeedsLogin')} />
      ) : connected ? (
        <SettingsRow label={t('planVsActual.googleConnected')}>
          <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} onClick={() => void disconnect()}>
            {t('planVsActual.disconnect')}
          </button>
        </SettingsRow>
      ) : (
        <SettingsRow label={t('googleSettings.notConnected')}>
          <button
            type="button"
            className={buttonClass({ variant: 'secondary', size: 'md' })}
            disabled={loading}
            onClick={() => void connect()}
          >
            {loading ? t('planVsActual.connecting') : t('planVsActual.googleConnectShort')}
          </button>
        </SettingsRow>
      )}
      {error && <p className="px-4 py-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </SettingsGroup>
  )
}
