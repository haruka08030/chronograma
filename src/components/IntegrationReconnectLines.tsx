import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { INBOX_ID } from '../store/storeConstants'
import { isCanvasListId } from '../lib/canvasIds'
import { useNotionReconnectNeeded } from '../hooks/useNotionSync'
import { useCanvasReconnectNeeded } from '../hooks/useCanvasSync'
import { ReconnectLine } from './ReconnectLine'

/**
 * Notion・Canvas の接続が切れたときの 1 行（#450）。取り込んだものが見える To-Do の「すべて」と受信箱の上に出す
 * （前の版の Canvas のリストを開いているときも）。押すとその連携の設定へ
 */
export function IntegrationReconnectLines({ listId }: { listId: string | null }) {
  const { t } = useTranslation()
  const openSettingsWithScroll = useTaskStore((s) => s.openSettingsWithScroll)
  /** To-Do の「すべて」（ラベルで絞っていない） */
  const allView = useTaskStore((s) => s.selectedView === 'all' && s.filterColor === null)
  const notion = useNotionReconnectNeeded()
  const canvas = useCanvasReconnectNeeded()
  const everything = listId === INBOX_ID || (!listId && allView)
  const lost = [
    ...(notion && everything ? (['notion'] as const) : []),
    ...(canvas && (everything || (listId !== null && isCanvasListId(listId))) ? (['canvas'] as const) : []),
  ]
  if (lost.length === 0) return null
  return (
    <>
      {lost.map((service) => {
        const name = service === 'notion' ? 'Notion' : 'Canvas'
        return (
          <ReconnectLine
            key={service}
            className="px-4 md:px-6"
            message={t('integrationReconnect.line', { name })}
            actionLabel={t('integrationReconnect.reconnect')}
            onAction={() => openSettingsWithScroll(service)}
          />
        )
      })}
    </>
  )
}
