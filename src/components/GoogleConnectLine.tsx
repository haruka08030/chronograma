import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { useAuth } from '../contexts/AuthContext'
import {
  disconnectGoogleCalendar,
  initGoogleAuth,
  localizeGoogleError,
  signIn,
  getClientId,
  getGoogleRedirectUri,
} from '../lib/googleCalendar'

/**
 * Google カレンダー連携の 1 行（旧「予定と記録」画面から移した）。
 * 未接続なら「並べて比べられます · 接続する」、接続中なら状態と解除だけ。
 */
const CONNECT_TIMEOUT_MS = 15_000

export function GoogleConnectLine() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const googleConnected = useTaskStore((s) => s.googleConnected)
  const googleConnectionError = useTaskStore((s) => s.googleConnectionError)
  const setGoogleConnected = useTaskStore((s) => s.setGoogleConnected)
  const setGoogleConnectionError = useTaskStore((s) => s.setGoogleConnectionError)
  const openSettingsWithScroll = useTaskStore((s) => s.openSettingsWithScroll)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clientId = getClientId()
  const redirectUri = getGoogleRedirectUri()

  const resolveConnectError = useCallback((e: unknown): string => {
    if (e instanceof Error) {
      if (e.message === 'GOOGLE_ALREADY_LINKED') return t('planVsActual.alreadyLinked')
      return localizeGoogleError(e.message, t)
    }
    return t('account.genericError')
  }, [t])

  // OAuth から戻ったときの ?code= の交換は AuthContext がどの画面でも行う。ここは戻る操作で読み込み中が残らないようにするだけ
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setLoading(false)
      }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const handleConnect = async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    setGoogleConnectionError(null)

    const timeoutId = window.setTimeout(() => {
      setLoading(false)
      setError(t('planVsActual.connectTimeout'))
    }, CONNECT_TIMEOUT_MS)

    try {
      await initGoogleAuth()
      await signIn()
      // Redirect started; page navigates away. If we reach here, already connected.
      window.clearTimeout(timeoutId)
      setLoading(false)
    } catch (e) {
      window.clearTimeout(timeoutId)
      setLoading(false)
      setGoogleConnected(false)
      setError(resolveConnectError(e))
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectGoogleCalendar()
    } catch {
      /* ignore */
    }
    setGoogleConnected(false)
    setGoogleConnectionError(null)
    setError(null)
    useTaskStore.getState().setCalendarEvents([])
  }

  const displayError = error ?? googleConnectionError

  if (!clientId) {
    // 環境変数の不足はデプロイ側の問題なので、エンドユーザーには何も見せない
    if (!import.meta.env.DEV) return null
    return (
      <div className="mx-6 mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
        <p className="font-medium">{t('planVsActual.googleUnavailableHeading')}</p>
        <p className="text-xs mt-1 opacity-80">
          {t('planVsActual.googleUnavailableBody')}
        </p>
      </div>
    )
  }

  if (googleConnected) {
    return (
      <div className="mx-6 mt-4 flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          {t('planVsActual.googleConnected')}
        </div>
        <button
          onClick={handleDisconnect}
          className="ml-auto text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          {t('planVsActual.disconnect')}
        </button>
      </div>
    )
  }

  // 未接続: 大きなボタンや警告を並べず 1 行だけ（予定と記録のグリッドを押し下げない）
  return (
    <div className="mx-4 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400 md:mx-6">
      <span>{t('planVsActual.googleOneLine')}</span>
      <button
        type="button"
        onClick={() => (user ? void handleConnect() : openSettingsWithScroll('account'))}
        disabled={loading}
        className="rounded-md px-1.5 py-0.5 font-medium text-accent-600 transition-colors hover:bg-accent-50 disabled:opacity-50 dark:text-accent-400 dark:hover:bg-accent-500/10"
      >
        {loading ? t('planVsActual.connecting') : user ? t('planVsActual.googleConnectShort') : t('planVsActual.googleLoginFirst')}
      </button>
      {import.meta.env.DEV && clientId && redirectUri && (
        <span className="w-full font-mono text-[10px] text-zinc-400">{t('planVsActual.redirectUriHint', { uri: redirectUri })}</span>
      )}
      {displayError && <span className="w-full text-red-500">{displayError}</span>}
    </div>
  )
}
