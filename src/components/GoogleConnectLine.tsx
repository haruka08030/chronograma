import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import { useGoogleConnect } from '../hooks/useGoogleConnect'
import { HINT_TEXT } from './ui/textClass'
import { iconButtonClass } from './ui/iconButtonClass'
import { CloseIcon } from './icons'
import { tip } from '../lib/tooltip'
import { notify } from '../lib/notify'

/**
 * カレンダー上の Google カレンダー連携の 1 行。
 * 未接続なら「並べて比べられます · 接続する ×」。× で閉じたら出さない（接続は設定の「Google カレンダー」から）。
 * 接続中は何も出さず（日付バーの点で示す）、問題があるときだけ赤い 1 行と切断を出す。切断は設定からもできる。
 */
export function GoogleConnectLine({ hideInvite = false }: {
  /** 未接続の案内だけ出さない（エラーの 1 行は出す）。スマホ幅で下に時間未定のタスクを開いている間 */
  hideInvite?: boolean
} = {}) {
  const { t } = useTranslation()
  const openSettingsWithScroll = useTaskStore((s) => s.openSettingsWithScroll)
  const dismissed = useTaskStore((s) => s.googleConnectLineDismissed)
  const dismiss = useTaskStore((s) => s.dismissGoogleConnectLine)
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
        <span className="min-w-0 flex-1 text-red-600 dark:text-red-400">{error}</span>
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

  if (dismissed || hideInvite) return null

  // 未接続: 大きなボタンや警告を並べず 1 行だけ（予定と記録のグリッドを押し下げない）。
  // スマホ幅で文が折り返しても、接続と × は右に並べたままにする
  return (
    <div className={`flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 py-1 pl-4 pr-2 md:pl-6 md:pr-4 ${HINT_TEXT}`}>
      <span className="min-w-0 flex-1 md:flex-none">{t('planVsActual.googleOneLine')}</span>
      <button
        type="button"
        onClick={() => (user ? void connect() : openSettingsWithScroll('account'))}
        disabled={loading}
        className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-accent-600 transition-colors hover:bg-accent-50 disabled:opacity-50 dark:text-accent-400 dark:hover:bg-accent-500/10"
      >
        {loading ? t('planVsActual.connecting') : user ? t('planVsActual.googleConnectShort') : t('planVsActual.googleLoginFirst')}
      </button>
      <button
        type="button"
        onClick={() => {
          dismiss()
          notify(t('planVsActual.googleLineDismissed'))
        }}
        aria-label={t('common.close')}
        {...tip(t('common.close'))}
        className={iconButtonClass('p-1.5 md:ml-auto')}
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
      {import.meta.env.DEV && redirectUri && (
        <span className="w-full font-mono text-[10px] text-zinc-400">{t('planVsActual.redirectUriHint', { uri: redirectUri })}</span>
      )}
      {error && <span className="w-full text-red-500">{error}</span>}
    </div>
  )
}
