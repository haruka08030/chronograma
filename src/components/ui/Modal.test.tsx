import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Modal, ModalTitle } from './Modal'

// jsdom は配置をしないので getClientRects が常に空になり、useFocusTrap が「見えている欄が無い」と扱う。
// 画面に付いている要素は見えている扱いにする
const realGetClientRects = Element.prototype.getClientRects
beforeAll(() => {
  Element.prototype.getClientRects = function (this: Element) {
    return (this.isConnected ? [new DOMRect(0, 0, 10, 10)] : []) as unknown as DOMRectList
  }
})
afterAll(() => {
  Element.prototype.getClientRects = realGetClientRects
})

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Outside</button>
      {open && (
        <Modal
          labelledBy="t"
          onClose={() => {
            onClose?.()
            setOpen(false)
          }}
        >
          <ModalTitle id="t">Rename</ModalTitle>
          <input aria-label="Name" />
          <button type="button">Cancel</button>
          <button type="button">Save</button>
        </Modal>
      )}
    </>
  )
}

describe('Modal', () => {
  it('開くとダイアログにフォーカスし、Tab / Shift+Tab は中だけを巡回する', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    const dialog = screen.getByRole('dialog', { name: 'Rename' })
    expect(dialog).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    // 最後から先頭へ回る（背景の「Outside」へ抜けない）
    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
  })

  it('Esc で閉じ、開く前の場所へフォーカスを戻す', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('背景を押すと閉じ、ダイアログの中を押しても閉じない', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Harness onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    await user.click(screen.getByRole('textbox', { name: 'Name' }))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
