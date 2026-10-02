import type { FormEvent } from 'react'
import { useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { POPOVER_PANEL } from './ui/surface'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { isNetworkErrorMessage } from '../lib/errorMessages'
import { isSupabaseConfigured } from '../lib/supabase'
import { useTaskStore } from '../store/taskStore'
import { buttonClass } from './ui/buttonClass'

export function AccountMenu({ variant = 'compact' }: { variant?: 'compact' | 'settings' }) {
  const { t } = useTranslation()
  const isSettings = variant === 'settings'
  const { user, loading, signInWithOtp, signOut, deleteAccount } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  useDismiss({ open, onClose: () => setOpen(false), inside: [wrapRef] })

  if (!isSupabaseConfigured) return null

  /** ログアウトするとこの端末のデータは消える（クラウドから戻る）。送れていない変更があるときだけ確かめる */
  const handleSignOut = () => {
    if (useTaskStore.getState().syncState !== 'idle' && !window.confirm(t('account.signOutUnsynced'))) return
    void signOut()
  }

  /** 取り消せないので 2 回確かめる。2 回目はメールアドレスの入力で、押し間違いでは消えないようにする */
  const handleDeleteAccount = async () => {
    if (!user) return
    if (!window.confirm(t('account.deleteConfirm'))) return
    const typed = window.prompt(t('account.deleteTypeEmail', { email: user.email ?? '' }))
    if (typed === null) return
    if (user.email && typed.trim().toLowerCase() !== user.email.toLowerCase()) {
      setError(t('account.deleteEmailMismatch'))
      return
    }
    setError(null)
    setPending(true)
    const res = await deleteAccount()
    setPending(false)
    if (res.error) setError(res.error)
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
        setMessage(t('account.linkSent'))
        setEmail('')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setError(isNetworkErrorMessage(message) ? t('account.networkError') : t('account.genericError'))
    } finally {
      setPending(false)
    }
  }

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 text-xs text-zinc-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" aria-hidden />
        {t('account.checking')}
      </span>
    )
  }

  if (user) {
    const label = user.email ?? user.id
    return (
      <div className={`relative flex items-center gap-3 ${isSettings ? 'flex-wrap' : ''}`}>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          {t('account.signedIn')}
        </span>
        <span
          className={`truncate text-xs text-zinc-600 dark:text-zinc-300 ${
            isSettings ? 'max-w-full sm:max-w-md' : 'hidden max-w-[140px] sm:inline'
          }`}
          title={label}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          className={buttonClass({ variant: 'secondary', size: 'sm' })}
        >
          {t('account.signOut')}
        </button>
        {isSettings && (
          <div className="basis-full border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">{t('account.deleteHelp')}</p>
            <button
              type="button"
              onClick={() => void handleDeleteAccount()}
              disabled={pending}
              className={buttonClass({ variant: 'danger', size: 'sm' })}
            >
              {pending ? t('account.deleting') : t('account.delete')}
            </button>
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        )}
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
          <div
            className={`absolute top-full z-50 mt-2 w-[min(100vw-2rem,20rem)] p-3 ${POPOVER_PANEL} ${
              isSettings ? 'left-0' : 'right-0'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
              {t('account.intro')}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-2">
              {t('account.agreePrefix')}
              <a href="/terms.html" target="_blank" rel="noopener" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">{t('settings.terms')}</a>
              {t('account.agreeAnd')}
              <a href="/privacy.html" target="_blank" rel="noopener" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">{t('settings.privacyPolicy')}</a>
              {t('account.agreeSuffix')}
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <input
                type="email"
                autoComplete="email"
                placeholder={t('account.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-accent-400 outline-none"
              />
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              {message && <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}
              <button
                type="submit"
                disabled={pending}
                className={buttonClass({ variant: 'primary', size: 'md' })}
              >
                {pending ? t('account.sending') : t('account.sendLink')}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
