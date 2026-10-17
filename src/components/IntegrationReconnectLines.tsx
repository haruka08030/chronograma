import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { INBOX_ID } from '../store/storeConstants'
import { CANVAS_LIST_ID } from '../lib/canvasIds'
import { useNotionReconnectNeeded } from '../hooks/useNotionSync'
import { useCanvasReconnectNeeded } from '../hooks/useCanvasSync'
import { ReconnectLine } from './ReconnectLine'

/**
 * Notion・Canvas の接続が切れたときの 1 行（#450）。取り込んだものが入るリストの上に出す
 * （Notion は受信箱、Canvas は Canvas のリスト）。押すとその連携の設定へ
 */
export function IntegrationReconnectLines({ listId }: { listId: string | null }) {
  const { t } = useTranslation()
  const openSettingsWithScroll = useTaskStore((s) => s.openSettingsWithScroll)
  const notion = useNotionReconnectNeeded()
  const canvas = useCanvasReconnectNeeded()
  const service = listId === INBOX_ID && notion ? 'notion' : listId === CANVAS_LIST_ID && canvas ? 'canvas' : null
  if (!service) return null
  const name = service === 'notion' ? 'Notion' : 'Canvas'
  return (
    <ReconnectLine
      className="px-4 md:px-6"
      message={t('integrationReconnect.line', { name })}
      actionLabel={t('integrationReconnect.reconnect')}
      onAction={() => openSettingsWithScroll(service)}
    />
  )
}
