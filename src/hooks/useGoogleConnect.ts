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
import { askConfirm } from '../lib/confirmDialog'

const CONNECT_TIMEOUT_MS = 15_000

/**
 * Google カレンダーの接続・切断。カレンダー上の 1 行と設定の「Google カレンダー」で同じものを使う。
 * OAuth から戻ったときの ?code= の交換は AuthContext がどの画面でも行う。
 */
export function useGoogleConnect() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const connected = useTaskStore((s) => s.googleConnected)
  const connectionError = useTaskStore((s) => s.googleConnectionError)
  const setGoogleConnected = useTaskStore((s) => s.setGoogleConnected)
  const setGoogleConnectionError = useTaskStore((s) => s.setGoogleConnectionError)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resolveConnectError = useCallback(
    (e: unknown): string => {
      if (e instanceof Error) {
        if (e.message === 'GOOGLE_ALREADY_LINKED') return t('planVsActual.alreadyLinked')
        return localizeGoogleError(e.message, t)
      }
      return t('account.genericError')
    },
    [t],
  )

  // 戻る操作で読み込み中が残らないようにする
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setLoading(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const connect = async () => {
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

  /** 解除する前に確認する（Notion・Canvas と同じ）。どこから押しても同じ確認が出る */
  const disconnect = async () => {
    const ok = await askConfirm({
      message: t('googleSettings.disconnectConfirm'),
      confirmLabel: t('integrations.disconnect'),
      danger: true,
    })
    if (!ok) return
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

  return {
    user,
    clientId: getClientId(),
    redirectUri: getGoogleRedirectUri(),
    connected,
    loading,
    error: error ?? connectionError,
    connect,
    disconnect,
  }
}
