import { useTaskStore } from '../store/taskStore'
import { pickOnboardingNudge, type OnboardingNudge } from '../lib/onboardingNudge'

/** いま出す誘い。今日の画面の下の通知の 1 行は、案内のあとのカードを出している間は出さない（同じことを 2 回聞かない） */
export function useOnboardingNudge(): OnboardingNudge | null {
  const onboardingDone = useTaskStore((s) => s.onboardingDone)
  const onboardingCompleted = useTaskStore((s) => s.onboardingCompleted)
  const installNudgeDismissed = useTaskStore((s) => s.installNudgeDismissed)
  const recordPrompts = useTaskStore((s) => s.recordPrompts)
  const reminderPromptDismissed = useTaskStore((s) => s.reminderPromptDismissed)
  return pickOnboardingNudge({ onboardingDone, onboardingCompleted, installNudgeDismissed, recordPrompts, reminderPromptDismissed })
}
