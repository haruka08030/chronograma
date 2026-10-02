import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useGoogleConnect } from '../../hooks/useGoogleConnect'
import { requestNotionSync } from '../../hooks/useNotionSync'
import { requestCanvasSync } from '../../hooks/useCanvasSync'
import { isSupabaseConfigured } from '../../lib/supabase'
import { disconnectNotion, fetchNotionStatus } from '../../lib/notion'
import { disconnectCanvas, fetchCanvasStatus, type CanvasConnection } from '../../lib/canvas'
import { SettingsGroup, SettingsRow } from './SettingsPrimitives'
import { buttonClass } from '../ui/buttonClass'
import { ChevronRightIcon } from '../icons'

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
          {disconnectButton(() => {
            if (!window.confirm(t('notion.disconnectConfirm'))) return
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
            {disconnectButton(() => {
              if (!window.confirm(t('canvas.disconnectConfirm', { host }))) return
              void run(async () => {
                setCanvas((await disconnectCanvas(c.id)).connections)
                requestCanvasSync()
              })
            })}
          </SettingsRow>
        )
      })}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-zinc-800 dark:text-zinc-200">
            {anyConnected ? t('integrations.manage') : t('integrations.add')}
          </span>
          {!anyConnected && <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{t('integrations.services')}</span>}
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
    </SettingsGroup>
  )
}
