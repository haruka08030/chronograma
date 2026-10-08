import { useTaskStore } from '../store/taskStore'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { pickOnboardingNudge, type OnboardingNudge } from '../lib/onboardingNudge'

/** いま出す誘い。今日の画面の下の通知の 1 行は、案内のあとのカードを出している間は出さない（同じことを 2 回聞かない） */
export function useOnboardingNudge(): OnboardingNudge | null {
  const onboardingDone = useTaskStore((s) => s.onboardingDone)
  const onboardingCompleted = useTaskStore((s) => s.onboardingCompleted)
  const installNudgeDismissed = useTaskStore((s) => s.installNudgeDismissed)
  const recordPrompts = useTaskStore((s) => s.recordPrompts)
  const reminderPromptDismissed = useTaskStore((s) => s.reminderPromptDismissed)
  const signInNudgeDismissed = useTaskStore((s) => s.signInNudgeDismissed)
  const canSignIn = useCanSuggestSignIn()
  return pickOnboardingNudge({
    onboardingDone,
    onboardingCompleted,
    installNudgeDismissed,
    recordPrompts,
    reminderPromptDismissed,
    canSignIn,
    signInNudgeDismissed,
  })
}

/** ログインを勧めてよい: ログインが使えて、ログインの確かめが済み、ログインしていない */
export function useCanSuggestSignIn(): boolean {
  const { user, loading } = useAuth()
  return isSupabaseConfigured && !loading && !user
}
