import { act, render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { expect, it, vi } from 'vitest'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { lazyNamed } from './lazyComponent'

// 読み込み直すと決まった後のふるまい（モジュールの状態が残るので、ほかのテストと分ける）
const { reloadForStaleChunk } = vi.hoisted(() => ({ reloadForStaleChunk: vi.fn(() => true) }))
vi.mock('./errorReport', () => ({ reportError: vi.fn() }))
vi.mock('./chunkLoad', async (importOriginal) => ({ ...(await importOriginal<typeof import('./chunkLoad')>()), reloadForStaleChunk }))

it('デプロイ直後の古いファイル名で読み込み直すときは、エラーの画面を一瞬出さず読み込み中のまま', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const Panel = lazyNamed(async (): Promise<{ Panel: () => null }> => {
    throw new TypeError('Failed to fetch dynamically imported module: https://a/assets/Panel-old.js')
  }, 'Panel')
  const Other = lazyNamed(async (): Promise<{ Other: () => null }> => {
    throw new TypeError('Failed to fetch dynamically imported module: https://a/assets/Other-old.js')
  }, 'Other')
  render(
    <ErrorBoundary scope="screen">
      <Suspense fallback={<p>loading</p>}>
        <Panel />
        <Other />
      </Suspense>
    </ErrorBoundary>,
  )
  await act(async () => {})
  expect(screen.getByText('loading')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
  // 読み込み直しは 1 回だけ頼む（2 つ目の失敗も読み込み中のまま待つ）
  expect(reloadForStaleChunk).toHaveBeenCalledTimes(1)
})
