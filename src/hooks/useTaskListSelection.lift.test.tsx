import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTaskListSelection } from './useTaskListSelection'
import { endLift, startLift } from '../lib/touchLift'

afterEach(() => endLift())

function setup() {
  return renderHook(() =>
    useTaskListSelection({
      rowIds: ['a', 'b'],
      rangeIds: ['a', 'b', 'done'],
      openDetail: vi.fn(),
      toggleRow: vi.fn(),
      removeRows: vi.fn(),
      completeRows: vi.fn(),
      openMenu: vi.fn(),
      resetOn: [],
    }),
  )
}

describe('タッチの長押しで浮かせた行の選択', () => {
  it('浮かせた行は選択に入る。もう選んでいる行は外さない（切り替えではない）', async () => {
    const { result } = setup()
    // 最初の resetOn の解除（queueMicrotask）を先に済ませる
    await act(async () => {})
    act(() => startLift('a'))
    expect([...result.current.selected]).toEqual(['a'])
    act(() => startLift('a'))
    expect([...result.current.selected]).toEqual(['a'])
  })

  it('別の行も足していく。完了済み（rangeIds）も選べ、この一覧に無い行は無視する', async () => {
    const { result } = setup()
    await act(async () => {})
    act(() => startLift('a'))
    act(() => startLift('done'))
    act(() => startLift('elsewhere'))
    expect([...result.current.selected].sort()).toEqual(['a', 'done'])
  })
})
