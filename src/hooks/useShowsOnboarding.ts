import { useSyncExternalStore } from 'react'
import { useTaskStore } from '../store/taskStore'
import { onPersistBlockedChange, persistBlocked } from '../lib/persistStorage'
import { useAuth } from '../contexts/AuthContext'
import { onboardingSteps } from '../lib/onboarding'
import { useAppTodayKey } from './useAppClock'

/**
 * はじめの案内を出すか（今日を見ていて、まだ案内を終えていない）。
 * ログイン中で、この端末でこの人としての初めての同期がまだ終わっていない間は出さない（アカウントのデータが届く前に一瞬出ていた）。
 * 終わると持ち主（dataOwner）がこの人になる。アカウントにデータがあれば、その同期で案内は終わる。
 * 保存を止めている間（保存データを読めない・新しい版のデータ・開けない）も出さない。データが空に見えても初めてではなく、
 * 案内どおりに入れた分は保存されない（#709）
 */
export function useShowsOnboarding(viewingToday: boolean): boolean {
  const onboardingDone = useTaskStore((s) => s.onboardingDone)
  const dataOwner = useTaskStore((s) => s.dataOwner)
  const { user, loading } = useAuth()
  const blocked = useSyncExternalStore(onPersistBlockedChange, persistBlocked)
  const awaitingFirstSync = loading || (user !== null && dataOwner !== user.id)
  return viewingToday && !onboardingDone && !awaitingFirstSync && !blocked
}

/** はじめの案内のいまのステップ（今日を見ているとき。今日の計画の部品で使う）。案内を出していなければ null */
export function useOnboardingStep(): 'add' | 'place' | 'record' | null {
  const todayKey = useAppTodayKey()
  const viewingToday = useTaskStore((s) => s.plannerDateKey === todayKey)
  const shows = useShowsOnboarding(viewingToday)
  // 案内を出していないとき（ほとんどの人）は数えない
  return useTaskStore((s) => {
    if (!shows) return null
    const steps = onboardingSteps(s.tasks, s.activeTimer !== null)
    return !steps.added ? 'add' : !steps.placed ? 'place' : !steps.recorded ? 'record' : null
  })
}

/** はじめの案内を終えた日の間か（睡眠の行・案内のあとの誘いは次の日から） */
export function useOnboardingFinishedToday(): boolean {
  const todayKey = useAppTodayKey()
  return useTaskStore((s) => s.onboardingFinishedOn === todayKey)
}
