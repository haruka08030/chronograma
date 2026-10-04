import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { useGoogleConnect } from '../hooks/useGoogleConnect'
import { ERROR_TEXT, HINT_TEXT } from './ui/textClass'

/**
 * カレンダー上の Google カレンダー連携の 1 行。
 * 未接続なら「並べて比べられます · 接続する」。接続中は何も出さず（日付バーの点で示す）、
 * 問題があるときだけ赤い 1 行と切断を出す。切断は設定の「Google カレンダー」からもできる。
 */
export function GoogleConnectLine() {
  const { t } = useTranslation()
  const openSettingsWithScroll = useTaskStore((s) => s.openSettingsWithScroll)
  const { user, clientId, redirectUri, connected, loading, error, connect, disconnect } = useGoogleConnect()

  if (!clientId) {
    // 環境変数の不足はデプロイ側の問題なので、エンドユーザーには何も見せない
    if (!import.meta.env.DEV) return null
    return (
      <div className="mx-4 my-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-500/30 text-sm text-amber-700 dark:text-amber-300 md:mx-6">
        <p className="font-medium">{t('planVsActual.googleUnavailableHeading')}</p>
        <p className="text-xs mt-1 opacity-80">
          {t('planVsActual.googleUnavailableBody')}
        </p>
      </div>
    )
  }

  if (connected) {
    if (!error) return null
    return (
      <div className="flex shrink-0 items-center gap-2 px-4 py-2 text-xs md:px-6">
        <span className={`min-w-0 flex-1 ${ERROR_TEXT}`}>{error}</span>
        <button
          type="button"
          onClick={() => void disconnect()}
          className="shrink-0 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          {t('planVsActual.disconnect')}
        </button>
      </div>
    )
  }

  // 未接続: 大きなボタンや警告を並べず 1 行だけ（予定と記録のグリッドを押し下げない）
  return (
    <div className={`flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 md:px-6 ${HINT_TEXT}`}>
      <span>{t('planVsActual.googleOneLine')}</span>
      <button
        type="button"
        onClick={() => (user ? void connect() : openSettingsWithScroll('account'))}
        disabled={loading}
        className="rounded-md px-1.5 py-0.5 font-medium text-accent-600 transition-colors hover:bg-accent-50 disabled:opacity-50 dark:text-accent-400 dark:hover:bg-accent-500/10"
      >
        {loading ? t('planVsActual.connecting') : user ? t('planVsActual.googleConnectShort') : t('planVsActual.googleLoginFirst')}
      </button>
      {import.meta.env.DEV && redirectUri && (
        <span className="w-full font-mono text-[10px] text-zinc-400">{t('planVsActual.redirectUriHint', { uri: redirectUri })}</span>
      )}
      {error && <span className={`w-full ${ERROR_TEXT}`}>{error}</span>}
    </div>
  )
}
