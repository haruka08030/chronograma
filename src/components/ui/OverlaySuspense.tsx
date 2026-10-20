import { Component, Suspense, type ReactNode } from 'react'
import i18n from '../../i18n/config'
import { isLazyLoadError, retryFailedLazyLoads, takeLoadFailureNotice } from '../../lib/lazyComponent'
import { notify } from '../../lib/notify'

type Props = {
  children: ReactNode
  /** 読めなかったときに、開いている詳細・メニューを閉じる（`PartBoundary` の `onCrash` と同じ）。中の遅れて読む部品をすべて閉じること */
  onLoadFailed?: () => void
}

/**
 * 遅れて読む詳細・メニュー・ポップオーバーの置き場（`<Suspense fallback={null}>` の代わり）。
 * ファイルが読めなかったら（オフライン・デプロイ直後）、画面全体のエラーにせず `onLoadFailed` で閉じて知らせる
 * （続けて失敗している間は 1 回だけ）。開いたまま見えない状態を残さない（関係ないところを押したときに急に出ない）。
 * 次に開いたとき・回線が戻ったときに、もう一度読みに行く。読み込み以外のエラーは外側の `ErrorBoundary` へ
 */
export class OverlaySuspense extends Component<Props, { error: unknown }> {
  state: { error: unknown } = { error: null }
  private disarm: (() => void) | null = null

  constructor(props: Props) {
    super(props)
    // 開き直したとき（この置き場が新しく出たとき）は、前に読めなかった部品も取り直す
    retryFailedLazyLoads()
  }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    if (!isLazyLoadError(error)) return
    if (takeLoadFailureNotice()) notify(i18n.t('crash.loadFailed'))
    this.props.onLoadFailed?.()
    this.armRetry()
  }

  // 閉じた（`onLoadFailed` で中身が変わった）ら元に戻す。次に開いたときに読み直す
  componentDidUpdate(prev: Props) {
    if (this.state.error && this.props.onLoadFailed && prev.children !== this.props.children) this.retry()
  }

  componentWillUnmount() {
    this.disarm?.()
  }

  private retry() {
    this.disarm?.()
    retryFailedLazyLoads()
    this.setState({ error: null })
  }

  /** 回線が戻ったら読み直す（押すたびには取りに行かない。オフラインで押すたびに知らせが出ないように） */
  private armRetry() {
    this.disarm?.()
    const retry = () => this.retry()
    window.addEventListener('online', retry)
    this.disarm = () => {
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
