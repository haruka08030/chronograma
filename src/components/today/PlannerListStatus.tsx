import { useTranslation } from 'react-i18next'
import { SUBTLE_TEXT } from '../ui/textClass'
import type { LeftBehind } from '../../lib/dayPlan'

/**
 * 今日の計画の To-Do の下の一言。
 * - 置いた行が全部終わった（期限切れも無い）: 「すべて完了」
 * - 過ぎた日に残したもの（`leftBehind`）が後日すべて終わった: 「残した N 件も、あとで終えました」。まだのものがあれば出さない（#522）
 * - 何も置いていない日（`totalCount === 0`）: 今は何も出さない
 */
export function PlannerListStatus({
  totalCount,
  openCount,
  overdueCount,
  leftBehind = [],
}: {
  totalCount: number
  openCount: number
  overdueCount: number
  /** 過ぎた日に置いて、その日には終えず一覧から消えたもの（`getDayLeftBehind`） */
  leftBehind?: LeftBehind[]
}) {
  const { t } = useTranslation()
  if (openCount > 0 || overdueCount > 0 || leftBehind.some((x) => !x.doneOn)) return null
  if (leftBehind.length > 0) return <p className={`px-6 pt-2 ${SUBTLE_TEXT}`}>{t('planner.allDoneLater', { count: leftBehind.length })}</p>
  if (totalCount > 0) return <p className={`px-6 pt-2 ${SUBTLE_TEXT}`}>{t('planner.allDone')}</p>
  return null
}
