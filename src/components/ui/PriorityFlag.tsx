import { useTranslation } from 'react-i18next'
import type { Priority } from '../../types/task'
import { PRIORITY_TEXT_CLASS } from '../../lib/priorityColor'
import { tip } from '../../lib/tooltip'
import { FlagIcon } from '../icons'

/** 行の右に添える優先度の旗（優先度の色。なし は出さない）。旗は優先度だけに使う（締切は DueIcon） */
export function PriorityFlag({ priority, className = '' }: { priority: Priority; className?: string }) {
  const { t } = useTranslation()
  if (priority === 'none') return null
  const label = `${t('common.priority')}: ${t(`common.${priority}`)}`
  return (
    <span data-priority={priority} {...tip(label)} className={`inline-flex shrink-0 ${PRIORITY_TEXT_CLASS[priority]} ${className}`}>
      <FlagIcon className="h-3.5 w-3.5" />
      <span className="sr-only">{label}</span>
    </span>
  )
}
