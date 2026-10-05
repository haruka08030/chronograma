import { act, fireEvent, render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { OverlaySuspense } from '../components/ui/OverlaySuspense'
import { useTaskStore } from '../store/taskStore'
import { lazyNamed } from './lazyComponent'

const { reportError, reloadForStaleChunk } = vi.hoisted(() => ({ reportError: vi.fn(), reloadForStaleChunk: vi.fn(() => false) }))
vi.mock('./errorReport', () => ({ reportError }))
vi.mock('./chunkLoad', async (importOriginal) => ({ ...(await importOriginal<typeof import('./chunkLoad')>()), reloadForStaleChunk }))

const staleChunk = () => new TypeError('Failed to fetch dynamically imported module: https://a/assets/Panel-old.js')
const module = { Panel: ({ label }: { label: string }) => <p>{label}</p> }

/** `online()` を呼ぶまで失敗し、その後は読める（React は失敗した描画を 1 回すぐやり直すので、1 回の失敗では足りない） */
function failingUntilOnline(err: unknown = staleChunk()) {
  let ok = false
  const load = vi.fn(async () => {
    if (!ok) throw err
    return module
  })
  return { load, Panel: lazyNamed(load, 'Panel'), online: () => (ok = true) }
}

beforeEach(() => {
  reportError.mockClear()
  reloadForStaleChunk.mockClear()
  // React がエラー境界で拾ったエラーを console に出すので、テストの出力を汚さない
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('lazyNamed', () => {
  it('一度読めなくても、もう一度開くと読める（詳細・メニュー）', async () => {
    const { load, Panel, online } = failingUntilOnline()
    const { rerender } = render(<OverlaySuspense>{<Panel label="opened" />}</OverlaySuspense>)
    // 読めなかった: 何も出さず、知らせる
    await act(async () => {})
    expect(screen.queryByText('opened')).toBeNull()
    expect(useTaskStore.getState().moveBannerText).toBe("Couldn't open this. Check your connection and try again.")
    expect(reportError).toHaveBeenCalledWith('chunk', expect.any(TypeError), { component: 'Panel' })
    // デプロイ直後の古いファイル名なら読み込み直しを試す（1 回だけにするのは reloadForStaleChunk。ここでは読み込み直さない設定）
    expect(reloadForStaleChunk).toHaveBeenCalled()
    // React が描画をすぐやり直しても、取りに行くのは 1 回だけ（オフラインの間に回り続けない）
    expect(load).toHaveBeenCalledTimes(1)
    const failed = load.mock.calls.length
    // 次に押したら読み直す
    online()
    fireEvent.pointerDown(window)
    expect(await screen.findByText('opened')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(failed + 1)
    // 閉じて開き直しても取り直さない
    rerender(<OverlaySuspense>{null}</OverlaySuspense>)
    rerender(<OverlaySuspense>{<Panel label="again" />}</OverlaySuspense>)
    expect(await screen.findByText('again')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(failed + 1)
  })

  it('閉じて開き直すと読み直す', async () => {
    const { load, Panel, online } = failingUntilOnline()
    const { unmount } = render(
      <OverlaySuspense>
        <Panel label="reopened" />
      </OverlaySuspense>,
    )
    await act(async () => {})
    expect(load).toHaveBeenCalledTimes(1)
    unmount()
    online()
    render(
      <OverlaySuspense>
        <Panel label="reopened" />
      </OverlaySuspense>,
    )
    expect(await screen.findByText('reopened')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('画面を切り替えると読み直す', async () => {
    const { load, Panel, online } = failingUntilOnline(new TypeError('Failed to fetch'))
    const screenAt = (key: string) => (
      <ErrorBoundary scope="screen" resetKey={key}>
        <Suspense fallback={null}>
          <Panel label={key} />
        </Suspense>
      </ErrorBoundary>
    )
    const { rerender } = render(screenAt('calendar'))
    // 画面のエラー: 「もう一度」が出る。回線の失敗なので読み込み直しはしない
    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(reloadForStaleChunk).not.toHaveBeenCalled()
    // ErrorBoundary は読み込みの失敗を描画のエラーとして二重に記録しない
    expect(reportError.mock.calls.every(([kind]) => kind === 'chunk')).toBe(true)
    const failed = load.mock.calls.length
    online()
    rerender(screenAt('stats'))
    expect(await screen.findByText('stats')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(failed + 1)
    expect(retry).not.toBeInTheDocument()
  })

  it('画面の「もう一度」で読み直す', async () => {
    const { Panel, online } = failingUntilOnline()
    render(
      <ErrorBoundary scope="screen">
        <Suspense fallback={null}>
          <Panel label="retried" />
        </Suspense>
      </ErrorBoundary>,
    )
    const retry = await screen.findByRole('button', { name: 'Try again' })
    online()
    fireEvent.click(retry)
    expect(await screen.findByText('retried')).toBeInTheDocument()
  })

  it('先読みの失敗は覚えない（開いたときに取り直す）', async () => {
    const { load, Panel, online } = failingUntilOnline()
    await expect(Panel.preload()).rejects.toThrow()
    online()
    render(
      <OverlaySuspense>
        <Panel label="after preload" />
      </OverlaySuspense>,
    )
    expect(await screen.findByText('after preload')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
    // 先読みの失敗は記録しない（オフラインの手すきの時間に出るだけ）
    expect(reportError).not.toHaveBeenCalled()
  })

  it('preload は読めた後は取りに行かない', async () => {
    const load = vi.fn(async () => module)
    const Panel = lazyNamed(load, 'Panel')
    await Panel.preload()
    await Panel.preload()
    render(
      <Suspense fallback={null}>
        <Panel label="once" />
      </Suspense>,
    )
    expect(await screen.findByText('once')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('読み込み以外のエラーは OverlaySuspense で止めず、外側の ErrorBoundary に任せる', async () => {
    const Broken = lazyNamed(
      async () => ({
        Broken: () => {
          throw new Error('render bug')
        },
      }),
      'Broken',
    )
    render(
      <ErrorBoundary scope="screen">
        <OverlaySuspense>
          <Broken />
        </OverlaySuspense>
      </ErrorBoundary>,
    )
    expect(await screen.findByText('render bug')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})
