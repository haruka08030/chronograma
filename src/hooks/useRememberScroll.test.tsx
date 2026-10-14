import { describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { rememberedScroll, useRememberScroll } from './useRememberScroll'

function Page({ memoryKey }: { memoryKey: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useRememberScroll(ref, memoryKey)
  return <div ref={ref} data-testid="page" />
}

describe('useRememberScroll', () => {
  it('戻ったら離れたときの位置から出す', () => {
    const first = render(<Page memoryKey="test:a" />)
    const el = first.getByTestId('page')
    el.scrollTop = 240
    fireEvent.scroll(el)
    expect(rememberedScroll('test:a')).toBe(240)
    first.unmount()

    const again = render(<Page memoryKey="test:a" />)
    expect(again.getByTestId('page').scrollTop).toBe(240)
  })

  it('画面ごとに別々に覚える', () => {
    const a = render(<Page memoryKey="test:b" />)
    const el = a.getByTestId('page')
    el.scrollTop = 120
    fireEvent.scroll(el)
    a.rerender(<Page memoryKey="test:c" />)
    expect(el.scrollTop).toBe(0)
    a.rerender(<Page memoryKey="test:b" />)
    expect(el.scrollTop).toBe(120)
  })
})
