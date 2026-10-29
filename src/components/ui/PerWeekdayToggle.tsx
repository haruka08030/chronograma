import { useTranslation } from 'react-i18next'
import { buttonClass } from './buttonClass'

/**
 * 「曜日ごとに時間を変える」⇄「どの曜日も同じ時間にする」（習慣の時間・睡眠の予定）。
 * 時間の欄のすぐ下に置き、押すと上の欄が曜日の行に分かれる・1 つに戻る
 */
export function PerWeekdayToggle({ split, onToggle, className = '' }: { split: boolean; onToggle: () => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <button type="button" aria-pressed={split} onClick={onToggle} className={buttonClass({ variant: 'link', size: 'xs' }, className)}>
      {split ? t('habits.sameTimeEveryDay') : t('habits.timePerWeekday')}
    </button>
  )
}
