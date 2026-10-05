import { useTranslation } from 'react-i18next'
import { SUBTLE_TEXT } from '../ui/textClass'

/**
 * 今日の計画の To-Do の下の一言。
 * - 置いた行が全部終わった（期限切れも無い）: 「すべて完了」
 * - 何も置いていない日（`totalCount === 0`）: 今は何も出さない
 */
export function PlannerListStatus({
  totalCount,
  openCount,
  overdueCount,
}: {
  totalCount: number
  openCount: number
  overdueCount: number
}) {
  const { t } = useTranslation()
  if (totalCount > 0 && openCount === 0 && overdueCount === 0) {
    return <p className={`px-6 pt-2 ${SUBTLE_TEXT}`}>{t('planner.allDone')}</p>
  }
  return null
}
