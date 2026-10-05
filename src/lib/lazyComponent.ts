import { createElement, lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { isChunkLoadError, reloadForStaleChunk } from './chunkLoad'
import { reportError } from './errorReport'

// 部品の props はそれぞれ違うので、ここでは問わない（呼ぶ側には元の部品の型がそのまま付く）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>

type Preloadable<C extends AnyComponent> = C & {
  /** 先に読み込んでおく（何度呼んでも、読めるまでは 1 回ずつ取りに行く） */
  preload: () => Promise<unknown>
}

/** 遅れて読む部品のファイルが読めなかった（`OverlaySuspense`・`ErrorBoundary` が「もう一度」にする） */
export class LazyLoadError extends Error {
  readonly component: string
  constructor(component: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = 'LazyLoadError'
    this.component = component
  }
}

export function isLazyLoadError(err: unknown): err is LazyLoadError {
  return err instanceof LazyLoadError
}

/** 読み込みに失敗した部品の作り直し（`retryFailedLazyLoads` で呼ぶ） */
const failed = new Set<() => void>()

/**
 * 読み込みに失敗した部品を作り直し、次に描くときにもう一度取りに行かせる。
 * エラーを出した境界（`OverlaySuspense`・`ErrorBoundary`）が元に戻るときに呼ぶ。
 * 失敗したその場で作り直すと、React が描画をすぐやり直すたびに取りに行き、オフラインの間ずっと回り続ける
 */
export function retryFailedLazyLoads(): void {
  const renew = [...failed]
  failed.clear()
  renew.forEach((fn) => fn())
}

/** 読み込みに失敗したとき: 記録し、デプロイ直後の古いファイル名なら 1 回だけ読み込み直す */
function onLoadFailure(err: unknown, component: string) {
  reportError('chunk', err, { component })
  if (isChunkLoadError(err)) reloadForStaleChunk()
}

/**
 * 開いたときにだけ要る部品（画面・詳細・メニュー・ポップオーバー）を、最初の読み込みから外す。
 * `export function Foo` の名前付き export をそのまま渡せる。`preload` は `preloadWhenIdle` に渡して、
 * 最初に開くときも待たずに出るようにする。描画は `<Suspense>` の中で（詳細・メニューは `OverlaySuspense`）。
 *
 * `React.lazy` は一度失敗するとその失敗を返し続けるので、失敗したものは境界が戻るとき（`retryFailedLazyLoads`。
 * `OverlaySuspense` は次に押したとき・回線が戻ったとき、`ErrorBoundary` は「もう一度」・画面の切り替え）に作り直し、
 * 次に描くときにもう一度取りに行く
 */
export function lazyNamed<M, K extends keyof M>(load: () => Promise<M>, name: K): Preloadable<M[K] extends AnyComponent ? M[K] : never> {
  const label = String(name)
  let pending: Promise<M> | null = null
  const preload = () => {
    // 失敗（オフライン・デプロイ直後など）は覚えておかず、次に開いたときに取り直す
    pending ??= load()
      .then((mod) => {
        // Vite の `vite:preloadError` を止める（再読み込みする）と、中身の無いまま解決する
        if (mod == null || mod[name] == null) throw new Error(`${label} did not load`)
        return mod
      })
      .catch((err: unknown) => {
        pending = null
        throw err
      })
    return pending
  }
  const create = (): LazyExoticComponent<AnyComponent> =>
    lazy(async () => {
      try {
        return { default: (await preload())[name] as AnyComponent }
      } catch (err) {
        // この lazy は失敗を覚えたままになる。境界が戻るときに新しいものにする
        failed.add(renew)
        onLoadFailure(err, label)
        throw new LazyLoadError(label, err)
      }
    })
  let current = create()
  const renew = () => {
    current = create()
  }
  function LazyComponent(props: Record<string, unknown>) {
    return createElement(current, props)
  }
  LazyComponent.displayName = `Lazy(${label})`
  return Object.assign(LazyComponent as unknown as M[K] extends AnyComponent ? M[K] : never, { preload })
}

/** ブラウザが手すきのときに先読みする（最初の描画の邪魔をしない）。失敗は開いたときに取り直すので無視 */
export function preloadWhenIdle(...preloads: (() => Promise<unknown>)[]): () => void {
  const run = () => preloads.forEach((p) => void p().catch(() => {}))
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 3000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(run, 1500)
  return () => window.clearTimeout(id)
}
