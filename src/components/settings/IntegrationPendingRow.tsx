import { useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import {
  pendingIntegrationWrites,
  retryIntegrationWrites,
  subscribeIntegrationWrites,
  type IntegrationName,
} from '../../lib/integrationWrites'
import { WRITE_BACK_KEEP_DAYS } from '../../lib/writeBackQueue'
import { buttonClass } from '../ui/buttonClass'
import { SettingsRow } from './SettingsPrimitives'

/**
 * 連携（Notion・Canvas）に送れずに待っている変更の件数と「今すぐ送る」（#716）。
 * 送り待ちは自動で送り直し、古くなると捨てるので、捨てる前に気づいてやり直せるよう設定の連携の所に出す。0 件なら出さない
 */
export function IntegrationPendingRow({ name }: { name: IntegrationName }) {
  const { t } = useTranslation()
  const count = useSyncExternalStore(subscribeIntegrationWrites, () => pendingIntegrationWrites(name))
  const [busy, setBusy] = useState(false)
  if (count === 0) return null
  return (
    <SettingsRow
      label={t('integrationPending.title', { target: t(`account.integrationName.${name}`), count })}
      help={t('integrationPending.help', { days: WRITE_BACK_KEEP_DAYS })}
    >
      <button
        type="button"
        className={buttonClass({ variant: 'secondary', size: 'md' })}
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void retryIntegrationWrites(name).finally(() => setBusy(false))
        }}
      >
        {t('integrationPending.retry')}
      </button>
    </SettingsRow>
  )
}
