import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDialogDraft } from './useDialogDraft'
import { clearDialogDrafts, hasDialogDraft } from '../lib/dialogDrafts'

describe('useDialogDraft: 閉じても書きかけを残す（#491）', () => {
  it('変えてから閉じると、次に開いたときに続きから', () => {
    const first = renderHook(() => useDialogDraft('memo', ''))
    act(() => first.result.current[1]('書きかけ'))
    first.unmount()

    const again = renderHook(() => useDialogDraft('memo', ''))
    expect(again.result.current[0]).toBe('書きかけ')
  })

  it('関数で渡すと前の中身から作る', () => {
    const { result } = renderHook(() => useDialogDraft('count', 1))
    act(() => {
      result.current[1]((n) => n + 1)
      result.current[1]((n) => n + 1)
    })
    expect(result.current[0]).toBe(3)
  })

  it('開いて閉じただけなら残さない（次はそのときの値から）', () => {
    const first = renderHook(() => useDialogDraft('memo', '保存された値'))
    first.unmount()
    expect(hasDialogDraft('memo')).toBe(false)

    const again = renderHook(() => useDialogDraft('memo', '新しい値'))
    expect(again.result.current[0]).toBe('新しい値')
  })

  it('discard（保存・キャンセル）で捨てると、次は最初から', () => {
    const first = renderHook(() => useDialogDraft('memo', ''))
    act(() => first.result.current[1]('書きかけ'))
    act(() => first.result.current[2]())
    first.unmount()

    const again = renderHook(() => useDialogDraft('memo', ''))
    expect(again.result.current[0]).toBe('')
  })

  it('discard に次の中身を渡すと、手元の中身も替える（残しはしない）', () => {
    const { result } = renderHook(() => useDialogDraft('form', { title: '', color: 'red' }))
    act(() => result.current[1]({ title: 'Gym', color: 'blue' }))
    act(() => result.current[2]({ title: '', color: 'blue' }))
    expect(result.current[0]).toEqual({ title: '', color: 'blue' })
    expect(hasDialogDraft('form')).toBe(false)
  })

  it('鍵ごとに分ける。相手が替わったら中身も替わる', () => {
    const { result, rerender } = renderHook(({ id }) => useDialogDraft(`habit-edit:${id}`, () => `元の ${id}`), {
      initialProps: { id: 'a' },
    })
    act(() => result.current[1]('A の書きかけ'))
    rerender({ id: 'b' })
    expect(result.current[0]).toBe('元の b')
    rerender({ id: 'a' })
    expect(result.current[0]).toBe('A の書きかけ')
  })

  it('アカウントの境目で全部消す', () => {
    const first = renderHook(() => useDialogDraft('memo', ''))
    act(() => first.result.current[1]('前の人の書きかけ'))
    first.unmount()
    clearDialogDrafts()

    const again = renderHook(() => useDialogDraft('memo', ''))
    expect(again.result.current[0]).toBe('')
  })
})
