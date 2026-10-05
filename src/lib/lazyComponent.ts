import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

// 部品の props はそれぞれ違うので、ここでは問わない（呼ぶ側には元の部品の型がそのまま付く）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>

type Preloadable<C extends AnyComponent> = LazyExoticComponent<C> & {
  /** 先に読み込んでおく（何度呼んでも 1 回だけ取りに行く） */
  preload: () => Promise<unknown>
}

/**
 * 開いたときにだけ要る部品（詳細・メニュー・ポップオーバー）を、最初の読み込みから外す。
 * `export function Foo` の名前付き export をそのまま渡せる。`preload` は `preloadWhenIdle` に渡して、
 * 最初に開くときも待たずに出るようにする。描画は `<Suspense fallback={null}>` の中で
 */
export function lazyNamed<M, K extends keyof M>(load: () => Promise<M>, name: K): Preloadable<M[K] extends AnyComponent ? M[K] : never> {
  let pending: Promise<M> | null = null
  const preload = () => {
    // 失敗（オフライン・デプロイ直後など）は覚えておかず、次に開いたときに取り直す
    pending ??= load().catch((err: unknown) => {
      pending = null
      throw err
    })
    return pending
  }
  const component = lazy(async () => ({ default: (await preload())[name] as never }))
  return Object.assign(component, { preload })
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
