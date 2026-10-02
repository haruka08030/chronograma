import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'

/** 日付バーの端の小さな点。Google カレンダーに接続中だけ出し、押すと設定の「Google カレンダー」を開く */
export function GoogleStatusDot() {
  const { t } = useTranslation()
  const connected = useTaskStore((s) => s.googleConnected)
  const openSettingsWithScroll = useTaskStore((s) => s.openSettingsWithScroll)

  if (!connected) return null

  return (
    <button
      type="button"
      onClick={() => openSettingsWithScroll('google')}
      title={t('planVsActual.googleConnected')}
      aria-label={t('planVsActual.googleConnected')}
      className="ml-auto shrink-0 rounded-full p-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <span className="block h-2 w-2 rounded-full bg-emerald-500" />
    </button>
  )
}
