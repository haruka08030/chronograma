import { isIos, isStandalone } from './pwa'

/**
 * はじめの 3 ステップを終えたあとに 1 回だけ出す誘い。
 * - install: iPhone / iPad の Safari（ホーム画面に未追加）で、ホーム画面への追加（通知はそこからしか届かない）
 */
export type OnboardingNudge = 'install'

export interface OnboardingNudgeState {
  onboardingDone: boolean
  onboardingCompleted: boolean
  installNudgeDismissed: boolean
}

/** iOS の Safari で開いていて、まだホーム画面に追加していない */
export function isIosBrowserNotInstalled(): boolean {
  return isIos() && !isStandalone()
}

export function pickOnboardingNudge(state: OnboardingNudgeState): OnboardingNudge | null {
  if (!state.onboardingDone || !state.onboardingCompleted) return null
  if (isIosBrowserNotInstalled() && !state.installNudgeDismissed) return 'install'
  return null
}
