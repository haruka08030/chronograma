import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { LONG_PRESS_MS, useLongPress } from './useLongPress'

function Row({ onClick, onLongPress }: { onClick: () => void; onLongPress: () => void }) {
  const lp = useLongPress(onLongPress)
  // 行と同じ付け方（テスト用の箱）
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div data-testid="row" {...lp.pointerHandlers} onClickCapture={lp.onClickCapture} onClick={onClick}>
      row
    </div>
  )
}

describe('useLongPress', () => {
  it('長押しの後に click が来なくても、次のタップは止めない', () => {
    vi.useFakeTimers()
    const onClick = vi.fn()
    const onLongPress = vi.fn()
    const { getByTestId } = render(<Row onClick={onClick} onLongPress={onLongPress} />)
    const row = getByTestId('row')

    // 長押し（iOS のように、離しても click は来ない）
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 0, clientY: 0 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10)
    })
    fireEvent.pointerUp(row, { pointerType: 'touch' })
    expect(onLongPress).toHaveBeenCalledTimes(1)

    // 次のタップ
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 0, clientY: 0 })
    fireEvent.pointerUp(row, { pointerType: 'touch' })
    fireEvent.click(row)
    expect(onClick).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('長押しの直後の click は止める', () => {
    vi.useFakeTimers()
    const onClick = vi.fn()
    const { getByTestId } = render(<Row onClick={onClick} onLongPress={() => {}} />)
    const row = getByTestId('row')
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 0, clientY: 0 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10)
    })
    fireEvent.pointerUp(row, { pointerType: 'touch' })
    fireEvent.click(row)
    expect(onClick).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
