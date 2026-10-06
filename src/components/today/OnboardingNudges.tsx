import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { pickOnboardingNudge } from '../../lib/onboardingNudge'
import { tip } from '../../lib/tooltip'
import { CloseIcon } from '../icons'
import { iconButtonClass } from '../ui/iconButtonClass'
import { HINT_TEXT, PHRASE_WRAP } from '../ui/textClass'

/**
 * はじめの 3 ステップを終えた直後に 1 回だけ出す誘い（今日の画面の追加欄の下、案内のあった場所）。
 * × で閉じたら二度と出さない（端末に保存）
 */
export function OnboardingNudges() {
  const { t } = useTranslation()
  const onboardingDone = useTaskStore((s) => s.onboardingDone)
  const onboardingCompleted = useTaskStore((s) => s.onboardingCompleted)
  const installNudgeDismissed = useTaskStore((s) => s.installNudgeDismissed)
  const dismissInstallNudge = useTaskStore((s) => s.dismissInstallNudge)
  const nudge = pickOnboardingNudge({ onboardingDone, onboardingCompleted, installNudgeDismissed })

  if (nudge === 'install') {
    return (
      <NudgeCard title={t('onboardingNudge.installTitle')} onClose={dismissInstallNudge}>
        <p className={`mt-0.5 ${HINT_TEXT} ${PHRASE_WRAP}`}>{t('onboardingNudge.installSteps')}</p>
      </NudgeCard>
    )
  }
  return null
}

function NudgeCard({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <section
      aria-label={title}
      className="mx-6 mt-6 flex items-start gap-2 rounded-lg border border-zinc-200 py-2.5 pl-3 pr-1.5 dark:border-zinc-700"
    >
      <div className="min-w-0 flex-1">
        <p className={`text-sm text-zinc-700 dark:text-zinc-200 ${PHRASE_WRAP}`}>{title}</p>
        {children}
      </div>
      <button type="button" onClick={onClose} {...tip(t('onboardingNudge.close'), { name: true })} className={iconButtonClass('p-1.5')}>
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </section>
  )
}
