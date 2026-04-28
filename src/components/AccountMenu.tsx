import type { FormEvent } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'

export function AccountMenu({ variant = 'compact' }: { variant?: 'compact' | 'settings' }) {
  const { t } = useTranslation()
  const isSettings = variant === 'settings'
  const { user, loading, signInWithOtp, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isSupabaseConfigured) return null

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
      setError(err instanceof Error ? err.message : t('account.genericError'))
    } finally {
      setPending(false)
    }
  }

  if (loading) {
    return (
      <span className="text-xs text-zinc-400 px-2" aria-hidden>
        …
      </span>
    )
  }

  if (user) {
    const label = user.email ?? user.id
    return (
      <div className={`relative flex items-center gap-3 ${isSettings ? 'flex-wrap' : ''}`}>
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
          onClick={() => void signOut()}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          {t('account.signOut')}
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs px-2.5 py-1.5 rounded-lg border border-accent-300 dark:border-accent-600 text-accent-700 dark:text-accent-300 hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors"
      >
        {t('account.signIn')}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label={t('account.closeOverlay')}
            onClick={() => setOpen(false)}
          />
          <div
            className={`absolute top-full z-50 mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 ${
              isSettings ? 'left-0' : 'right-0'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
              {t('account.intro')}
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
                className="text-sm py-2 rounded-lg bg-accent-500 text-white font-medium hover:bg-accent-600 disabled:opacity-50"
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
