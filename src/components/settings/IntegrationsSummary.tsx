import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useGoogleConnect } from '../../hooks/useGoogleConnect'
import { requestNotionSync } from '../../hooks/useNotionSync'
import { requestCanvasSync } from '../../hooks/useCanvasSync'
import { isSupabaseConfigured } from '../../lib/supabase'
import { disconnectNotion, fetchNotionStatus } from '../../lib/notion'
import { disconnectCanvas, fetchCanvasStatus, type CanvasConnection } from '../../lib/canvas'
import { SettingsGroup, SettingsLinkRow, SettingsRow } from './SettingsPrimitives'
import { buttonClass } from '../ui/buttonClass'
import { askConfirm } from '../../lib/confirmDialog'

/**
 * 設定のトップに置く外部連携のまとめ。使う人だけが使う機能なので、つなぐ・細かく設定するのは次のページ
 * （IntegrationsPage）に回し、ここには接続中のものと切断だけを出す。
 */
export function IntegrationsSummary({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const google = useGoogleConnect()
  const [notion, setNotion] = useState<string | null>(null)
  const [canvas, setCanvas] = useState<CanvasConnection[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || !isSupabaseConfigured) return
    let cancelled = false
    // 状態が取れなければ「つないでいない」と同じに扱う（詳しいエラーは次のページで出す）
    fetchNotionStatus()
      .then((s) => !cancelled && setNotion(s.connected ? s.databaseTitle : null))
      .catch(() => {})
    fetchCanvasStatus()
      .then((s) => !cancelled && setCanvas(s.connections))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      console.error('[integrations] disconnect', e)
    } finally {
      setBusy(false)
    }
  }

  const disconnectButton = (onClick: () => void) => (
    <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} disabled={busy} onClick={onClick}>
      {t('integrations.disconnect')}
    </button>
  )

  if (!isSupabaseConfigured) return null

  const anyConnected = google.connected || notion !== null || canvas.length > 0

  return (
    <SettingsGroup id="settings-integrations" title={t('integrations.title')}>
      {google.connected && google.clientId && (
        <SettingsRow label={t('googleSettings.title')}>
          {disconnectButton(() => void run(() => google.disconnect()))}
        </SettingsRow>
      )}
      {notion !== null && (
        <SettingsRow label="Notion" help={notion}>
          {disconnectButton(async () => {
            if (!(await askConfirm({ message: t('notion.disconnectConfirm'), confirmLabel: t('notion.disconnect'), danger: true }))) return
            void run(async () => {
              await disconnectNotion()
              setNotion(null)
              requestNotionSync()
            })
          })}
        </SettingsRow>
      )}
      {canvas.map((c) => {
        const host = new URL(c.baseUrl).host
        return (
          <SettingsRow key={c.id} label="Canvas" help={host}>
            {disconnectButton(async () => {
              if (!(await askConfirm({ message: t('canvas.disconnectConfirm', { host }), confirmLabel: t('canvas.disconnect'), danger: true }))) return
              void run(async () => {
                setCanvas((await disconnectCanvas(c.id)).connections)
                requestCanvasSync()
              })
            })}
          </SettingsRow>
        )
      })}
      <SettingsLinkRow
        label={anyConnected ? t('integrations.manage') : t('integrations.add')}
        hint={anyConnected ? undefined : t('integrations.services')}
        onClick={onOpen}
      />
    </SettingsGroup>
  )
}
