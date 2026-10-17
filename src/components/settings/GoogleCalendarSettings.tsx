import { useTranslation } from 'react-i18next'
import { useGoogleConnect } from '../../hooks/useGoogleConnect'
import { isSupabaseConfigured } from '../../lib/supabase'
import { SettingsGroup, SettingsRow } from './SettingsPrimitives'
import { buttonClass } from '../ui/buttonClass'
import { ERROR_TEXT } from '../ui/textClass'

/** Google カレンダー連携。カレンダー画面では接続中を点でしか示さないので、状態の確認と切断はここで行う */
export function GoogleCalendarSettings() {
  const { t } = useTranslation()
  const { user, clientId, connected, reconnectNeeded, loading, error, connect, disconnect } = useGoogleConnect()

  if (!isSupabaseConfigured || !clientId) return null

  return (
    <SettingsGroup id="settings-google" title={t('googleSettings.title')}>
      {!user ? (
        <SettingsRow label={t('planVsActual.googleNeedsLogin')} />
      ) : connected ? (
        <SettingsRow label={t('planVsActual.googleConnected')}>
          <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} onClick={() => void disconnect()}>
            {t('integrations.disconnect')}
          </button>
        </SettingsRow>
      ) : reconnectNeeded ? (
        // 切れたまま。つなぎ直すのを先に、使わないなら外せるように
        <SettingsRow label={t('integrationReconnect.settingsLabel')}>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} onClick={() => void disconnect()}>
              {t('integrations.disconnect')}
            </button>
            <button
              type="button"
              className={buttonClass({ variant: 'primary', size: 'md' })}
              disabled={loading}
              onClick={() => void connect()}
            >
              {loading ? t('planVsActual.connecting') : t('googleReconnect.reconnect')}
            </button>
          </div>
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
      {error && <p className={`px-4 py-3 ${ERROR_TEXT}`}>{error}</p>}
    </SettingsGroup>
  )
}
