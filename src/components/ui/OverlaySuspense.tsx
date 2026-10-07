import { Component, Suspense, type ReactNode } from 'react'
import i18n from '../../i18n/config'
import { isLazyLoadError, retryFailedLazyLoads } from '../../lib/lazyComponent'
import { notify } from '../../lib/notify'

/**
 * 遅れて読む詳細・メニュー・ポップオーバーの置き場（`<Suspense fallback={null}>` の代わり）。
 * ファイルが読めなかったら（オフライン・デプロイ直後）、画面全体のエラーにせず何も出さずに知らせ、
 * 次に画面を押す・キーを押す・回線が戻ると、もう一度読みに行く。読み込み以外のエラーは外側の `ErrorBoundary` へ
 */
export class OverlaySuspense extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null }
  private disarm: (() => void) | null = null

  constructor(props: { children: ReactNode }) {
    super(props)
    // 開き直したとき（この置き場が新しく出たとき）は、前に読めなかった部品も取り直す
    retryFailedLazyLoads()
  }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    if (!isLazyLoadError(error)) return
    notify(i18n.t('crash.loadFailed'))
    this.armRetry()
  }

  componentWillUnmount() {
    this.disarm?.()
  }

  private armRetry() {
    this.disarm?.()
    const retry = () => {
      this.disarm?.()
      retryFailedLazyLoads()
      this.setState({ error: null })
    }
    const events = ['pointerdown', 'keydown'] as const
    for (const type of events) window.addEventListener(type, retry, true)
    window.addEventListener('online', retry)
    this.disarm = () => {
      for (const type of events) window.removeEventListener(type, retry, true)
      window.removeEventListener('online', retry)
      this.disarm = null
    }
  }

  render() {
    const { error } = this.state
    if (error) {
      // 読み込み以外（描画のエラー）はここで止めず、外側の ErrorBoundary に任せる
      if (!isLazyLoadError(error)) throw error
      return null
    }
    return <Suspense fallback={null}>{this.props.children}</Suspense>
  }
}
