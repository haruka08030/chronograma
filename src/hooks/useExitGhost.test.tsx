import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { EXIT_MS } from './usePresence'
import { useExitGhost } from './useExitGhost'
import { Modal } from '../components/ui/Modal'

/** jsdom はクラスから動きを読まないので、出る動きの付いた面は style で印を付ける */
function Panel({ animated = true }: { animated?: boolean }) {
  const exitRef = useExitGhost<HTMLDivElement>()
  return (
    <div ref={exitRef} id="panel" className="animate-fade-in" style={animated ? { animationName: 'fade-in' } : undefined}>
      <div className="animate-pop-in">中身</div>
    </div>
  )
}

function Harness({ animated }: { animated?: boolean }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button type="button" onClick={() => setOpen(false)}>
        閉じる
      </button>
      {open && <Panel animated={animated} />}
    </div>
  )
}

const ghost = () => document.querySelector<HTMLElement>('[data-exit-ghost]')

async function close() {
  await act(async () => {
    document.querySelector('button')!.click()
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useExitGhost', () => {
  it('閉じた面の写しを同じ所に残し、背景は fade-out・面は pop-out で消えてから外す。写しは押せない', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    render(<Harness />)
    await close()
    const g = ghost()!
    expect(g).not.toBeNull()
    expect(g.className).toBe('animate-fade-out')
    expect(g.querySelector('.animate-pop-out')).not.toBeNull()
    expect(g.inert).toBe(true)
    expect(g).toHaveAttribute('aria-hidden', 'true')
    expect(g.id).toBe('')
    act(() => void vi.advanceTimersByTime(EXIT_MS - 1))
    expect(ghost()).not.toBeNull()
    act(() => void vi.advanceTimersByTime(1))
    expect(ghost()).toBeNull()
  })

  it('動きを減らす設定ではすぐ消える', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    render(<Harness />)
    await close()
    expect(ghost()).toBeNull()
  })

  it('出る動きの無い面は写さない', async () => {
    render(<Harness animated={false} />)
    await close()
    expect(ghost()).toBeNull()
  })

  it('Modal を呼び出し側が外しても閉じる動きが付く', async () => {
    const style = document.createElement('style')
    style.textContent = '.animate-fade-in { animation-name: fade-in; }'
    document.head.appendChild(style)
    function ModalHarness() {
      const [open, setOpen] = useState(true)
      return open ? (
        <Modal label="ダイアログ" onClose={() => setOpen(false)}>
          <button type="button" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </Modal>
      ) : null
    }
    render(<ModalHarness />)
    await close()
    const g = ghost()!
    expect(g.className).toContain('animate-fade-out')
    expect(g.querySelector('[role=dialog]')?.className).toContain('animate-pop-out')
    style.remove()
  })
})
