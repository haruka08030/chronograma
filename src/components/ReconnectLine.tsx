import { ERROR_TEXT, PHRASE_WRAP } from './ui/textClass'

/**
 * 連携の接続が切れたときの 1 行（Google・Notion・Canvas で共通、#449・#450）。何が起きたかと、直すための 1 つのボタン。
 * × では消さない（つなぎ直すか、設定で外すまで出す）
 */
export function ReconnectLine({
  message,
  actionLabel,
  onAction,
  busy = false,
  detail,
  className = '',
}: {
  message: string
  actionLabel: string
  onAction: () => void
  busy?: boolean
  /** ボタンを押して失敗したときの説明など */
  detail?: string | null
  className?: string
}) {
  return (
    <div className={`flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 py-1 text-xs ${className}`}>
      <span className={`min-w-0 flex-1 md:flex-none ${ERROR_TEXT} ${PHRASE_WRAP}`}>{message}</span>
      <button
        type="button"
        onClick={onAction}
        disabled={busy}
        className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-accent-600 transition-colors hover:bg-accent-50 disabled:opacity-50 dark:text-accent-400 dark:hover:bg-accent-500/10"
      >
        {actionLabel}
      </button>
      {detail && <span className={`w-full ${ERROR_TEXT}`}>{detail}</span>}
    </div>
  )
}
