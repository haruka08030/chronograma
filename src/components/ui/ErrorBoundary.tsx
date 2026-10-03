import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../../i18n/config'
import { buttonClass } from './buttonClass'
import { downloadRawData, latestAutoBackup } from '../../lib/crashRecovery'
import { askConfirm } from '../../lib/confirmDialog'

/**
 * 描画中のエラーで画面全体が真っ白にならないようにする。
 * - `scope="screen"`: 1 画面だけ止める。サイドバーは残るので、ほかの画面へ移れば `resetKey` が変わって戻る
 * - `scope="app"`: いちばん外側。ここまで来たら再読み込みだけを出す
 * 文言は i18n のインスタンスから直接引く（フックの手前で落ちていても出せるように）
 */
/**
 * 保存したデータが原因で毎回落ちるときの逃げ道。いちばん新しい自動バックアップで置き換えて開き直す
 * （置き換える前の状態は取り込みの控えに残るので、開けたら設定から戻せる）
 */
async function restoreLatest() {
  const t = i18n.t.bind(i18n)
  const backup = await latestAutoBackup()
  if (!backup) {
    window.alert(t('crash.noBackup'))
    return
  }
  if (!(await askConfirm({ message: t('crash.restoreConfirm', { date: new Date(backup.savedAt).toLocaleString(i18n.language) }), confirmLabel: t('crash.restore') }))) return
  const { useTaskStore } = await import('../../store/taskStore')
  if (!useTaskStore.getState().importData(backup.json)) {
    window.alert(t('crash.noBackup'))
    return
  }
  window.location.reload()
}

export class ErrorBoundary extends Component<
  { scope: 'app' | 'screen'; resetKey?: string; onLeave?: () => void; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[error-boundary:${this.props.scope}]`, error, info.componentStack)
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const { scope, onLeave } = this.props
    const t = i18n.t.bind(i18n)
    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-3 px-4 text-center ${
          scope === 'app'
            ? 'h-dvh bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100'
            : 'flex-1 min-h-0'
        }`}
      >
        <h1 className="text-base font-semibold">{t('crash.title')}</h1>
        <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
          {t(scope === 'app' ? 'crash.appHelp' : 'crash.screenHelp')}
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button type="button" className={buttonClass({ variant: 'primary', size: 'md' })} onClick={() => window.location.reload()}>
            {t('crash.reload')}
          </button>
          {scope === 'app' && (
            <>
              <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} onClick={downloadRawData}>
                {t('crash.export')}
              </button>
              <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} onClick={() => void restoreLatest()}>
                {t('crash.restore')}
              </button>
            </>
          )}
          {scope === 'screen' && onLeave && (
            <button type="button" className={buttonClass({ variant: 'secondary', size: 'md' })} onClick={onLeave}>
              {t('crash.goToday')}
            </button>
          )}
        </div>
        <details className="mt-2 max-w-md text-xs text-zinc-400 dark:text-zinc-500">
          <summary className="cursor-pointer">{t('crash.details')}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-left">{error.message}</pre>
        </details>
      </div>
    )
  }
}
