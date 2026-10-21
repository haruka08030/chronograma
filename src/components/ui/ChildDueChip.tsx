import { useTranslation } from 'react-i18next'
import type { ChildDue } from '../../hooks/useChildDue'
import { tip } from '../../lib/tooltip'
import { DueIcon } from '../icons'
import { DUE_TONE_CLASS } from './dueTone'

/**
 * 子の締切を「ES 10/16 (金)まで」で出す。子の行が見えない所（今日の計画・カレンダーの横の To-Do）だけで使う。
 * To-Do 一覧は子がすぐ下に見えるので出さない
 */
export function ChildDueChip({ due }: { due: ChildDue }) {
  const { t } = useTranslation()
  return (
    <span
      data-child-due={due.child.id}
      {...tip(t('taskItem.nextChildDueHint', { title: due.child.title }))}
      className={`inline-flex min-w-0 items-center gap-0.5 text-[11px] ${DUE_TONE_CLASS[due.tone]}`}
    >
      <DueIcon className="w-3 h-3 shrink-0" />
      <span className="max-w-[10rem] truncate">{due.child.title}</span>
      <span className="shrink-0">{due.text}</span>
    </span>
  )
}
