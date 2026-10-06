import { isIos, isStandalone } from './pwa'

/**
 * はじめの 3 ステップを終えたあとに 1 回だけ出す誘い。
 * - install: iPhone / iPad の Safari（ホーム画面に未追加）で、ホーム画面への追加（通知はそこからしか届かない）
 * - recordPrompts: 予定のあとの「予定どおり / 記録する」の通知をオンにする。iPhone の Safari では
 *   通知が届かないので、ホーム画面に追加して開いたときに出す（ホーム画面のアプリは保存先が別なので、そこで 1 回）
 */
export type OnboardingNudge = 'install' | 'recordPrompts'

export interface OnboardingNudgeState {
  onboardingDone: boolean
  onboardingCompleted: boolean
  installNudgeDismissed: boolean
  recordPrompts: boolean
  /** 通知の誘い（今日の画面の下の 1 行と、案内のあとのカード）を閉じた・使った */
  reminderPromptDismissed: boolean
}

/** iOS の Safari で開いていて、まだホーム画面に追加していない */
export function isIosBrowserNotInstalled(): boolean {
  return isIos() && !isStandalone()
}

/** 通知の許可を聞ける（使えない環境・もう断られたときは false） */
export function canAskNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'denied'
}

export function pickOnboardingNudge(state: OnboardingNudgeState): OnboardingNudge | null {
  if (!state.onboardingDone) return null
  if (isIosBrowserNotInstalled()) {
    // 先にホーム画面への追加（通知は追加したあとでないと届かない）
    return state.onboardingCompleted && !state.installNudgeDismissed ? 'install' : null
  }
  const offered = state.onboardingCompleted || (isIos() && isStandalone())
  if (offered && !state.recordPrompts && !state.reminderPromptDismissed && canAskNotifications()) return 'recordPrompts'
  return null
}
