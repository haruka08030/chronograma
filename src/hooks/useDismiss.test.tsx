import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useDismiss } from './useDismiss'

function Card({ onClose, label, swallow }: { onClose: () => void; label: string; swallow: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss({ open: true, onClose, inside: [ref], swallow })
  return (
    <div ref={ref} role="dialog" aria-label={label}>
      <button type="button">{`${label} inside`}</button>
    </div>
  )
}

function Harness({ onBehind, nested = false, swallow = true }: { onBehind: () => void; nested?: boolean; swallow?: boolean }) {
  const [outer, setOuter] = useState(true)
  const [inner, setInner] = useState(nested)
  return (
    <>
      <button type="button" onClick={onBehind} onPointerDown={onBehind} onMouseDown={onBehind}>
        Behind
      </button>
      {outer && <Card label="Outer" swallow={swallow} onClose={() => setOuter(false)} />}
      {inner && <Card label="Inner" swallow={swallow} onClose={() => setInner(false)} />}
    </>
  )
}

// 開いた押下では閉じないよう、次のタイミングから拾う
const arm = () => act(() => new Promise((r) => setTimeout(r, 0)))

describe('useDismiss', () => {
  it('下からのシートは外を押すと閉じるだけで、下のボタンには押下もクリックも届かない', async () => {
    const onBehind = vi.fn()
    const user = userEvent.setup()
    render(<Harness onBehind={onBehind} />)
    await arm()

    await user.click(screen.getByRole('button', { name: 'Behind' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onBehind).not.toHaveBeenCalled()
    // 次の押下はふつうに届く
    await user.click(screen.getByRole('button', { name: 'Behind' }))
    expect(onBehind).toHaveBeenCalled()
  })

  it('指で押したあとに来るクリック・長押しのメニューも下に届かない', async () => {
    const onBehind = vi.fn()
    const onContext = vi.fn()
    render(<Harness onBehind={onBehind} />)
    await arm()
    const behind = screen.getByRole('button', { name: 'Behind' })
    behind.addEventListener('click', onBehind)
    behind.addEventListener('contextmenu', onContext)
    behind.addEventListener('touchstart', onBehind)

    fireEvent.pointerDown(behind, { pointerId: 7, pointerType: 'touch' })
    fireEvent.touchStart(behind)
    fireEvent.contextMenu(behind)
    fireEvent.pointerUp(behind, { pointerId: 7, pointerType: 'touch' })
    fireEvent.touchEnd(behind)
    fireEvent.mouseDown(behind)
    fireEvent.mouseUp(behind)
    fireEvent.click(behind)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onBehind).not.toHaveBeenCalled()
    expect(onContext).not.toHaveBeenCalled()
  })

  it('PC のカード・メニューは外を押すと閉じ、押下は下のボタンへそのまま届く', async () => {
    const onBehind = vi.fn()
    const user = userEvent.setup()
    render(<Harness onBehind={onBehind} swallow={false} />)
    await arm()
    const behind = screen.getByRole('button', { name: 'Behind' })
    const onClick = vi.fn()
    behind.addEventListener('click', onClick)
    await user.click(behind)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('中を押しても閉じない', async () => {
    const user = userEvent.setup()
    render(<Harness onBehind={() => {}} />)
    await arm()
    await user.click(screen.getByRole('button', { name: 'Outer inside' }))
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument()
  })

  it('重なっているときは一番上の 1 枚だけを閉じる', async () => {
    const user = userEvent.setup()
    render(<Harness onBehind={() => {}} nested />)
    await arm()
    await user.click(screen.getByRole('button', { name: 'Behind' }))
    expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument()
  })

  it('全面を覆うシートは背景を押すと閉じるだけで、上に出た知らせを押しても閉じない', async () => {
    const onToast = vi.fn()
    function Sheet() {
      const [open, setOpen] = useState(true)
      const root = useRef<HTMLDivElement>(null)
      const panel = useRef<HTMLDivElement>(null)
      useDismiss({ open, onClose: () => setOpen(false), inside: [panel], backdrop: root })
      return (
        <>
          {open && (
            <div ref={root} data-testid="backdrop">
              <div ref={panel} role="dialog" aria-label="Sheet" />
            </div>
          )}
          <button type="button" onClick={onToast}>
            Toast
          </button>
        </>
      )
    }
    const user = userEvent.setup()
    render(<Sheet />)
    await arm()
    await user.click(screen.getByRole('button', { name: 'Toast' }))
    expect(onToast).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog', { name: 'Sheet' })).toBeInTheDocument()
    await user.click(screen.getByTestId('backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Esc でも閉じる', async () => {
    const user = userEvent.setup()
    render(<Harness onBehind={() => {}} />)
    await arm()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
