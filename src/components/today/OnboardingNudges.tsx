import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../../store/taskStore'
import { useAuth } from '../../contexts/AuthContext'
import { useCanSuggestSignIn, useOnboardingNudge } from '../../hooks/useOnboardingNudge'
import { requestPermission } from '../../lib/notifications'
import { isGoogleAvailable } from '../../lib/googleCalendar'
import { buttonClass } from '../ui/buttonClass'
import { GoogleSignInButton } from '../ui/GoogleSignInButton'
import { tip } from '../../lib/tooltip'
import { CloseIcon } from '../icons'
import { iconButtonClass } from '../ui/iconButtonClass'
import { ERROR_TEXT, HINT_TEXT, PHRASE_WRAP } from '../ui/textClass'

/**
 * はじめの 3 ステップを終えた直後に 1 回だけ出す誘い（今日の画面の追加欄の下、案内のあった場所）。
 * × で閉じたら二度と出さない（端末に保存）。iPhone の Safari ではホーム画面への追加、ほかはログイン（していなければ）→
 * 予定のあとの確認の通知の順に 1 つずつ
 */
export function OnboardingNudges() {
  const { t } = useTranslation()
  const nudge = useOnboardingNudge()
  const canSignIn = useCanSuggestSignIn()
  const dismissInstallNudge = useTaskStore((s) => s.dismissInstallNudge)
  const dismissSignInNudge = useTaskStore((s) => s.dismissSignInNudge)
  const dismissReminderPrompt = useTaskStore((s) => s.dismissReminderPrompt)
  const setRecordPrompts = useTaskStore((s) => s.setRecordPrompts)
  const [asking, setAsking] = useState(false)

  /** 許可を聞いて、許されたら予定のあとの確認をオンにする（購読は useReminders が合わせる）。断られても閉じる */
  const enableRecordPrompts = async () => {
    setAsking(true)
    try {
      if (await requestPermission()) setRecordPrompts(true)
    } finally {
      setAsking(false)
      dismissReminderPrompt()
    }
  }

  if (nudge === 'install') {
    return (
      <NudgeCard title={t('onboardingNudge.installTitle')} onClose={dismissInstallNudge}>
        <p className={`mt-0.5 ${HINT_TEXT} ${PHRASE_WRAP}`}>{t('onboardingNudge.installSteps')}</p>
        {/* ホーム画面のアプリは保存先が別で空で開く。先にログインしていれば同じデータが出る */}
        {canSignIn && (
          <>
            <p className={`mt-1.5 ${HINT_TEXT} ${PHRASE_WRAP}`}>{t('onboardingNudge.installSignIn')}</p>
            <SignInAction />
          </>
        )}
      </NudgeCard>
    )
  }
  if (nudge === 'signIn') {
    return (
      <NudgeCard title={t('onboardingNudge.signInTitle')} onClose={dismissSignInNudge}>
        <p className={`mt-0.5 ${HINT_TEXT} ${PHRASE_WRAP}`}>{t('onboardingNudge.signInBody')}</p>
        <SignInAction />
      </NudgeCard>
    )
  }
  if (nudge === 'recordPrompts') {
    return (
      <NudgeCard title={t('onboardingNudge.recordPromptsTitle')} onClose={dismissReminderPrompt}>
        <button
          type="button"
          onClick={() => void enableRecordPrompts()}
          disabled={asking}
          className={buttonClass({ variant: 'primary', size: 'sm' }, 'mt-2')}
        >
          {t('onboardingNudge.recordPromptsEnable')}
        </button>
      </NudgeCard>
    )
  }
  return null
}

/**
 * ログインに進むボタン。Google が使えればそのまま Google の画面へ（1 タップ）、使えなければ設定のログインを開く。
 * 押しただけでは閉じた扱いにしない（ログインし終えれば消える。途中でやめて戻ってきたら、まだ出ている）
 */
function SignInAction() {
  const { t } = useTranslation()
  const { signInWithGoogle } = useAuth()
  const openSettingsWithScroll = useTaskStore((s) => s.openSettingsWithScroll)
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Google の画面から戻るボタンで戻ると、移動中のまま押せない画面が復元される
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setRedirecting(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  if (!isGoogleAvailable()) {
    return (
      <button
        type="button"
        onClick={() => openSettingsWithScroll('account')}
        className={buttonClass({ variant: 'primary', size: 'sm' }, 'mt-2')}
      >
        {t('onboardingNudge.signIn')}
      </button>
    )
  }

  const handleGoogle = async () => {
    setError(null)
    setRedirecting(true)
    const res = await signInWithGoogle()
    if (res.error) {
      setError(res.error)
      setRedirecting(false)
    }
  }

  return (
    <>
      <GoogleSignInButton size="sm" onClick={() => void handleGoogle()} disabled={redirecting} className="mt-2">
        {redirecting ? t('account.redirecting') : t('account.signInWithGoogle')}
      </GoogleSignInButton>
      {error && <p className={`mt-1.5 ${ERROR_TEXT}`}>{error}</p>}
    </>
  )
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
