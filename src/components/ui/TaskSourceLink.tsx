import { useTranslation } from 'react-i18next'
import type { SourceLink } from '../../lib/sourceLink'
import { tip } from '../../lib/tooltip'
import { ExternalLinkIcon } from '../icons'

const SERVICE_NAME = { canvas: 'Canvas', notion: 'Notion' } as const

/** 「Canvas で開く」「Notion で開く」「リンクを開く」 */
function useSourceLinkLabel() {
  const { t } = useTranslation()
  return (link: SourceLink) => (link.service ? t('taskItem.openIn', { name: SERVICE_NAME[link.service] }) : t('taskItem.openLink'))
}

/**
 * メモがリンクだけのタスク（Canvas・Notion の取り込み）の「開く」アイコン。
 * To-Do 一覧の行・今日の計画の行で同じものを使う。行を押したとき（詳細を開く）とは別に開く。
 * カードの上の操作の列に置くときは `className` に `iconButtonClass()` を渡す。
 */
export function TaskSourceLink({
  link,
  className = 'inline-flex items-center rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200',
  iconClassName = 'h-3.5 w-3.5',
}: {
  link: SourceLink
  className?: string
  iconClassName?: string
}) {
  const label = useSourceLinkLabel()(link)
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      draggable={false}
      {...tip(label, { name: true })}
      className={className}
    >
      <ExternalLinkIcon className={iconClassName} />
    </a>
  )
}
