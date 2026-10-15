import { useTaskStore } from '../store/taskStore'
import { useAuth } from '../contexts/AuthContext'

/**
 * はじめの案内を出すか（今日を見ていて、まだ案内を終えていない）。
 * ログイン中で、この端末でこの人としての初めての同期がまだ終わっていない間は出さない（アカウントのデータが届く前に一瞬出ていた）。
 * 終わると持ち主（dataOwner）がこの人になる。アカウントにデータがあれば、その同期で案内は終わる
 */
export function useShowsOnboarding(viewingToday: boolean): boolean {
  const onboardingDone = useTaskStore((s) => s.onboardingDone)
  const dataOwner = useTaskStore((s) => s.dataOwner)
  const { user, loading } = useAuth()
  const awaitingFirstSync = loading || (user !== null && dataOwner !== user.id)
  return viewingToday && !onboardingDone && !awaitingFirstSync
}
