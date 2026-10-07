import { act, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { openTaskDetail, openTaskMenu, useOverlays } from '../../lib/overlays'
import { OverlayHost } from '../OverlayHost'
import { ActionMenu } from './ActionMenu'
import { PartBoundary } from './ErrorBoundary'

// 詳細とメニューは描くと例外を投げる部品に差し替える
vi.mock('../lazyOverlays', () => {
  const Boom = (): never => {
    throw new Error('boom')
  }
  return {
    TaskDetail: Boom,
    TaskContextMenu: Boom,
    TaskEventMenu: Boom,
    GoogleEventMenu: Boom,
    TimeSlotMenu: Boom,
    DueDateTimeMenu: Boom,
    preloadOverlays: () => {},
  }
})
vi.mock('../../lib/errorReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/errorReport')>()),
  reportError: vi.fn(),
}))

let consoleError: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  // React と境界の console.error（落ちたことの記録）はここでは見ない
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  useOverlays.setState({ detailTaskId: null, menu: null })
})
afterEach(() => consoleError.mockRestore())

const Main = () => <main>main screen</main>

describe('PartBoundary', () => {
  it('タスク詳細の描画で落ちても、メイン画面は残り、詳細だけ閉じて通知が出る', async () => {
    const id = useTaskStore.getState().addTask('Report')!
    render(
      <>
        <Main />
        <OverlayHost />
      </>,
    )
    act(() => openTaskDetail(id))

    expect(screen.getByText('main screen')).toBeInTheDocument()
    expect(useOverlays.getState().detailTaskId).toBeNull()
    await waitFor(() => expect(useTaskStore.getState().moveBannerText).toBeTruthy())
  })

  it('右クリックのメニューで落ちても、メイン画面は残り、メニューだけ閉じる', async () => {
    const id = useTaskStore.getState().addTask('Report')!
    render(
      <>
        <Main />
        <OverlayHost />
      </>,
    )
    act(() => openTaskMenu({ kind: 'task', x: 10, y: 10, taskIds: [id] } as Parameters<typeof openTaskMenu>[0]))

    expect(screen.getByText('main screen')).toBeInTheDocument()
    expect(useOverlays.getState().menu).toBeNull()
    await waitFor(() => expect(useTaskStore.getState().moveBannerText).toBeTruthy())
  })

  it('いつも出ている部品（検索欄など）は、落ちたら消え、resetKey が変わると描き直す', () => {
    let explode = true
    const Search = () => {
      if (explode) throw new Error('boom')
      return <input aria-label="Search" />
    }
    const { rerender } = render(
      <>
        <Main />
        <PartBoundary name="search" resetKey="a">
          <Search />
        </PartBoundary>
      </>,
    )
    expect(screen.getByText('main screen')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Search' })).toBeNull()

    explode = false
    rerender(
      <>
        <Main />
        <PartBoundary name="search" resetKey="b">
          <Search />
        </PartBoundary>
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeInTheDocument()
  })
})

describe('ActionMenu', () => {
  it('閉じたら開いた元のボタンへフォーカスを戻す', () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            More
          </button>
          {open && (
            <ActionMenu
              x={0}
              y={0}
              entries={[{ kind: 'leaf', id: 'a', label: 'Rename', onSelect: () => {} } as never]}
              onClose={() => setOpen(false)}
            />
          )}
          <button type="button" onClick={() => setOpen(false)}>
            CloseIt
          </button>
        </>
      )
    }
    render(<Harness />)
    const more = screen.getByRole('button', { name: 'More' })
    more.focus()
    act(() => more.click())
    expect(more).not.toHaveFocus()
    // メニューの中にフォーカスがあるまま閉じる（Esc と同じ）
    act(() => screen.getByRole('button', { name: 'CloseIt' }).click())
    expect(more).toHaveFocus()
  })
})
