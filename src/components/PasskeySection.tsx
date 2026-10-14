import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, type PasskeyItem } from '../contexts/AuthContext'
import { askConfirm } from '../lib/confirmDialog'
import { isPasskeySupported } from '../lib/passkey'
import { buttonClass } from './ui/buttonClass'
import { ERROR_TEXT, HINT_TEXT, META_TEXT } from './ui/textClass'

/**
 * ログイン中の「パスキー」の欄。この端末のパスキーを登録し、登録済みのものを一覧・削除する。
 * 登録しておくと、ホーム画面の PWA でもメールや Google の画面に移らずにログインできる
 */
export function PasskeySection() {
  const { t, i18n } = useTranslation()
  const { listPasskeys, registerPasskey, deletePasskey } = useAuth()
  const supported = isPasskeySupported()
  const [passkeys, setPasskeys] = useState<PasskeyItem[] | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const res = await listPasskeys()
    if (res.error) setError(res.error)
    else setPasskeys(res.passkeys ?? [])
  }, [listPasskeys])

  useEffect(() => {
    let cancelled = false
    void listPasskeys().then((res) => {
      if (cancelled) return
      if (res.error) setError(res.error)
      else setPasskeys(res.passkeys ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [listPasskeys])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const handleAdd = async () => {
    setError(null)
    setMessage(null)
    setPending(true)
    const res = await registerPasskey()
    setPending(false)
    if (res.error) {
      setError(res.error)
      return
    }
    // 閉じただけなら何も出さない
    if (res.failure === 'cancelled') return
    setMessage(t('account.passkeyAdded'))
    await reload()
  }

  const handleRemove = async (p: PasskeyItem) => {
    const ok = await askConfirm({
      message: t('account.passkeyRemoveConfirm', { name: p.name }),
      confirmLabel: t('account.passkeyRemove'),
      danger: true,
    })
    if (!ok) return
    setError(null)
    setMessage(null)
    setPending(true)
    const res = await deletePasskey(p.id)
    setPending(false)
    if (res.error) setError(res.error)
    else await reload()
  }

  return (
    <div className="basis-full border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <p className="mb-1 text-sm font-medium">{t('account.passkeyTitle')}</p>
      <p className={`mb-2 ${HINT_TEXT}`}>{t('account.passkeyHelp')}</p>
      {passkeys && passkeys.length > 0 ? (
        <ul className="mb-2 flex max-w-sm flex-col gap-1.5">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-sm">{p.name}</span>
                <span className={`block ${META_TEXT}`}>
                  {p.lastUsedAt
                    ? t('account.passkeyLastUsed', { date: formatDate(p.lastUsedAt) })
                    : t('account.passkeyCreated', { date: formatDate(p.createdAt) })}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void handleRemove(p)}
                disabled={pending}
                className={buttonClass({ variant: 'ghost', size: 'xs' })}
              >
                {t('account.passkeyRemove')}
              </button>
            </li>
          ))}
        </ul>
      ) : passkeys ? (
        <p className={`mb-2 ${META_TEXT}`}>{t('account.passkeyNone')}</p>
      ) : null}
      {supported ? (
        <button type="button" onClick={() => void handleAdd()} disabled={pending} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          {pending ? t('account.passkeyAdding') : t('account.passkeyAdd')}
        </button>
      ) : (
        <p className={META_TEXT}>{t('account.passkeyNotSupported')}</p>
      )}
      {message && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}
      {error && <p className={`mt-2 ${ERROR_TEXT}`}>{error}</p>}
    </div>
  )
}
