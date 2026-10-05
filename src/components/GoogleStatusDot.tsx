import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'

/**
 * 日付の隣の小さな点。Google カレンダーに接続中だけ出す。
 * 乗せる（スマホはタップ）と「Google Calendar 接続中」と出るだけで、押しても何もしない。切断は設定から。
 */
export function GoogleStatusDot() {
  const { t } = useTranslation()
  const connected = useTaskStore((s) => s.googleConnected)

  if (!connected) return null

  const label = t('planVsActual.googleConnected')
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 押しても何もしない印。キーでも説明（ツールチップ）を出せるようにフォーカスだけ受ける
    <span tabIndex={0} role="img" aria-label={label} className="group relative flex shrink-0 items-center p-1.5 outline-none">
      <span className="block h-2 w-2 rounded-full bg-emerald-500 group-focus-visible:ring-2 group-focus-visible:ring-emerald-300" />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-1 top-full z-40 mt-1 whitespace-nowrap rounded-md bg-zinc-800 px-2 py-1 text-xs text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus:opacity-100 dark:bg-zinc-700"
      >
        {label}
      </span>
    </span>
  )
}
