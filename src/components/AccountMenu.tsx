import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { POPOVER_PANEL } from './ui/surface'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { isNetworkErrorMessage } from '../lib/errorMessages'
import { authLinkErrorKey, clearAuthLinkError, pendingAuthLinkError } from '../lib/authLinkError'
import { isSupabaseConfigured, loadSupabase } from '../lib/supabase'
import { flushPendingSync } from '../hooks/useSupabaseSync'
import { buttonClass } from './ui/buttonClass'
import { fieldClass } from './ui/fieldClass'
import { askConfirm } from '../lib/confirmDialog'
import { isGoogleAvailable } from '../lib/googleCalendar'
import { GoogleSignInButton } from './ui/GoogleSignInButton'
import { ERROR_TEXT, HINT_TEXT, META_TEXT } from './ui/textClass'

export function AccountMenu() {
  const { t } = useTranslation()
  const { user, loading, signInWithOtp, verifyEmailOtp, signInWithGoogle, signOut, deleteAccount } = useAuth()
  // ログイン用リンクが使えずに戻ってきたときは、送り直せるよう入力欄を開いて始める
  const [open, setOpen] = useState(() => pendingAuthLinkError() != null)
  const [email, setEmail] = useState('')
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  /** 削除の前の本人確認（サーバーが最近のログインを求めたとき）。コードを送る前 / 送った後 */
  const [reauth, setReauth] = useState<'needed' | 'codeSent' | null>(null)
  const [reauthCode, setReauthCode] = useState('')
  const [error, setError] = useState<string | null>(() => {
    const linkError = pendingAuthLinkError()
    return linkError ? t(authLinkErrorKey(linkError)) : null
  })
  const googleSignIn = isGoogleAvailable()
  // メールの欄は Google が使えないときと、メールのリンクが使えずに戻ってきたときだけ最初から開く
  const [emailOpen, setEmailOpen] = useState(() => {
    const linkError = pendingAuthLinkError()
    return !googleSignIn || (linkError != null && authLinkErrorKey(linkError) !== 'account.googleFailed')
  })
  useEffect(() => clearAuthLinkError(), [])
  // ログインの欄を開いたら、押す前に Supabase を読んでおく（ログインしない人は起動時に読まない、#268）
  const signedOut = !user && !loading
  useEffect(() => {
    if (signedOut && isSupabaseConfigured) void loadSupabase().catch(() => {})
  }, [signedOut])
  // Google の画面から戻るボタンで戻ると、移動中のまま押せない画面が復元される
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setRedirecting(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])
  const wrapRef = useRef<HTMLDivElement>(null)
  useDismiss({ open, onClose: () => setOpen(false), inside: [wrapRef] })

  if (!isSupabaseConfigured) return null

  /**
   * ログアウトするとこの端末のデータは消える（クラウドから戻る）。待っている変更を先に送り、
   * 送れなかったときだけ確かめる
   */
  const handleSignOut = async () => {
    setPending(true)
    const synced = await flushPendingSync()
    setPending(false)
    if (!synced && !(await askConfirm({ message: t('account.signOutUnsynced'), confirmLabel: t('account.signOut'), danger: true }))) return
    await signOut()
  }

  /** 取り消せないので、確認のダイアログでメールアドレスを打ってもらってから消す */
  const handleDeleteAccount = async () => {
    if (!user) return
    // 取り消せないので、メールアドレスを打つまで削除できない（押し間違いでは消えない）
    const ok = await askConfirm({
      message: t('account.deleteConfirm'),
      confirmLabel: t('account.delete'),
      danger: true,
      requireText: user.email ? { label: t('account.deleteTypeEmail', { email: user.email }), expected: user.email } : undefined,
    })
    if (!ok) return
    await runDelete()
  }

  /** 削除を送る。最近ログインしていなければ、メールのコードでログインし直す欄を出す */
  const runDelete = async () => {
    setError(null)
    setMessage(null)
    setPending(true)
    const res = await deleteAccount()
    setPending(false)
    if (res.reauthRequired) {
      if (user?.email) setReauth('needed')
      else setError(t('account.reauthSignInAgain'))
      return
    }
    if (res.error) setError(res.error)
  }

  const sendReauthCode = async () => {
    if (!user?.email) return
    setError(null)
    setMessage(null)
    setPending(true)
    const res = await signInWithOtp(user.email)
    setPending(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setReauth('codeSent')
    setReauthCode('')
    setMessage(t('account.reauthCodeSent'))
  }

  /** コードでログインし直してから、もう一度削除を送る（確認のダイアログは済んでいる） */
  const confirmReauth = async (e: FormEvent) => {
    e.preventDefault()
    if (!user?.email || !reauthCode.trim()) return
    setError(null)
    setPending(true)
    const res = await verifyEmailOtp(user.email, reauthCode)
    setPending(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setReauth(null)
    setReauthCode('')
    await runDelete()
  }

  const cancelReauth = () => {
    setReauth(null)
    setReauthCode('')
    setError(null)
    setMessage(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    if (!email.trim()) {
      setError(t('account.emailRequired'))
      return
    }
    setPending(true)
    try {
      const res = await signInWithOtp(email)
      if (res.error) setError(res.error)
      else {
        setMessage(t('account.codeSent'))
        setCodeSentTo(email.trim())
        setCode('')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setError(isNetworkErrorMessage(message) ? t('account.networkError') : t('account.genericError'))
    } finally {
      setPending(false)
    }
  }

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    if (!codeSentTo || !code.trim()) return
    setError(null)
    setPending(true)
    try {
      const res = await verifyEmailOtp(codeSentTo, code)
      if (res.error) setError(res.error)
      else {
        setCodeSentTo(null)
        setCode('')
        setEmail('')
        setMessage(null)
        setOpen(false)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setError(isNetworkErrorMessage(message) ? t('account.networkError') : t('account.genericError'))
    } finally {
      setPending(false)
    }
  }

  /** Google の画面に移る。うまく移れたらこのページは離れるので、押せないままにしておく */
  const handleGoogle = async () => {
    setError(null)
    setMessage(null)
    setRedirecting(true)
    const res = await signInWithGoogle()
    if (res.error) {
      setError(res.error)
      setRedirecting(false)
    }
  }

  const resetToEmail = () => {
    setCodeSentTo(null)
    setCode('')
    setError(null)
    setMessage(null)
  }

  if (loading) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 ${META_TEXT}`}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" aria-hidden />
        {t('account.checking')}
      </span>
    )
  }

  if (user) {
    const label = user.email ?? user.id
    return (
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          {t('account.signedIn')}
        </span>
        <span className="max-w-full truncate text-xs text-zinc-600 sm:max-w-md dark:text-zinc-300" title={label}>
          {label}
        </span>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={pending}
          className={buttonClass({ variant: 'secondary', size: 'sm' })}
        >
          {t('account.signOut')}
        </button>
        <div className="basis-full border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className={`mb-2 ${HINT_TEXT}`}>{t('account.deleteHelp')}</p>
          {reauth && user.email ? (
            <form onSubmit={(e) => void confirmReauth(e)} className="flex max-w-sm flex-col gap-2">
              <p className={`break-all ${HINT_TEXT}`}>{t('account.reauthNeeded', { email: user.email })}</p>
              {reauth === 'codeSent' && (
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={10}
                  placeholder={t('account.codePlaceholder')}
                  aria-label={t('account.codePlaceholder')}
                  value={reauthCode}
                  onChange={(e) => setReauthCode(e.target.value.replace(/\D/g, ''))}
                  className={fieldClass({}, 'w-full tracking-widest')}
                />
              )}
              {message && <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}
              <div className="flex flex-wrap gap-2">
                {reauth === 'codeSent' ? (
                  <button type="submit" disabled={pending || !reauthCode.trim()} className={buttonClass({ variant: 'danger', size: 'sm' })}>
                    {pending ? t('account.deleting') : t('account.reauthConfirm')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void sendReauthCode()}
                  disabled={pending}
                  className={buttonClass({ variant: reauth === 'codeSent' ? 'ghost' : 'secondary', size: 'sm' })}
                >
                  {pending && reauth === 'needed'
                    ? t('account.sending')
                    : reauth === 'codeSent'
                      ? t('account.reauthResend')
                      : t('account.reauthSend')}
                </button>
                <button type="button" onClick={cancelReauth} disabled={pending} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => void handleDeleteAccount()}
              disabled={pending}
              className={buttonClass({ variant: 'danger', size: 'sm' })}
            >
              {pending ? t('account.deleting') : t('account.delete')}
            </button>
          )}
          {error && <p className={`mt-2 ${ERROR_TEXT}`}>{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={buttonClass({ variant: 'secondary', size: 'sm' })}
      >
        {t('account.signIn')}
      </button>
      {open && (
        <>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 外へクリックを伝えないだけ（押して何かする部品ではない） */}
          <div
            className={`absolute top-full left-0 z-50 mt-2 w-[min(100vw-2rem,20rem)] origin-top-left p-3 ${POPOVER_PANEL}`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className={`mb-3 ${HINT_TEXT}`}>{t('account.intro')}</p>
            {/* Google が主。メールは Supabase の送信数が少なく届かないことがあるので、控えめに下へ */}
            {!codeSentTo && googleSignIn && (
              <GoogleSignInButton onClick={() => void handleGoogle()} disabled={pending || redirecting} className="w-full">
                {redirecting ? t('account.redirecting') : t('account.signInWithGoogle')}
              </GoogleSignInButton>
            )}
            {codeSentTo ? (
              <form onSubmit={(e) => void handleVerify(e)} className="flex flex-col gap-2">
                <p className={`break-all ${HINT_TEXT}`}>{codeSentTo}</p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={10}
                  placeholder={t('account.codePlaceholder')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className={fieldClass({}, 'w-full tracking-widest')}
                />
                {error && <p className={ERROR_TEXT}>{error}</p>}
                {message && <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}
                <button type="submit" disabled={pending || !code.trim()} className={buttonClass({ variant: 'primary', size: 'md' })}>
                  {pending ? t('account.verifying') : t('account.verifyCode')}
                </button>
                <button type="button" onClick={resetToEmail} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                  {t('account.changeEmail')}
                </button>
              </form>
            ) : emailOpen ? (
              <form
                onSubmit={(e) => void handleSubmit(e)}
                className={`flex flex-col gap-2${googleSignIn ? ' mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800' : ''}`}
              >
                <input
                  type="email"
                  autoComplete="email"
                  placeholder={t('account.emailPlaceholder')}
                  aria-label={t('account.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  // 押して開いた欄にはそのまま書ける
                  autoFocus={googleSignIn}
                  className={fieldClass({}, 'w-full')}
                />
                {error && <p className={ERROR_TEXT}>{error}</p>}
                {message && <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}
                <button
                  type="submit"
                  disabled={pending}
                  className={buttonClass({ variant: googleSignIn ? 'secondary' : 'primary', size: 'md' })}
                >
                  {pending ? t('account.sending') : t('account.sendLink')}
                </button>
              </form>
            ) : (
              <>
                {error && <p className={`mt-2 ${ERROR_TEXT}`}>{error}</p>}
                <div className="mt-2 flex justify-center">
                  <button type="button" onClick={() => setEmailOpen(true)} className={buttonClass({ variant: 'ghost', size: 'xs' })}>
                    {t('account.useEmail')}
                  </button>
                </div>
              </>
            )}
            <p className={`mt-3 ${META_TEXT}`}>
              {t('account.agreePrefix')}
              <a href="/terms.html" target="_blank" rel="noopener" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
                {t('settings.terms')}
              </a>
              {t('account.agreeAnd')}
              <a href="/privacy.html" target="_blank" rel="noopener" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
                {t('settings.privacyPolicy')}
              </a>
              {t('account.agreeSuffix')}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
